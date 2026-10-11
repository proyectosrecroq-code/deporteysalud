// Server-only: owner session handling and member authentication on top of the admin client.
// Import it dynamically from server-function handlers (see api.functions.ts).
import { getRequest } from "@tanstack/react-start/server";
import type { Json } from "@/integrations/supabase/types";
import { AUTH_REQUIRED, SESSION_HOURS } from "./auth-errors";
import {
  type AttemptStore,
  type LimiterState,
  type Rule,
  assertNotLocked,
  clearAttempts,
  consumeAttempt,
  fingerprint,
  hashPassword,
  recordFailure,
  safeEqualText,
  signSession,
  verifyPassword,
  verifySession,
} from "./auth-core.server";
import { PASSWORD_MIN } from "./validation";

export type AdminDb = Awaited<ReturnType<typeof adminDb>>;

export async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const SETTINGS_ID = 1;
const LIMITER_ID = 2;

// Attempt budgets. Owner: strict (one person, long password). Members: per phone, per IP and global.
const OWNER_IP: Rule = { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const OWNER_ALL: Rule = { max: 60, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const MEMBER_PHONE: Rule = { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const MEMBER_IP: Rule = { max: 15, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const MEMBER_ALL: Rule = { max: 300, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const REQUEST_IP: Rule = { max: 60, windowMs: 60 * 60_000, lockMs: 60 * 60_000 };

export function clientIp(): string {
  const headers = getRequest()?.headers;
  const raw = headers?.get("cf-connecting-ip") ?? headers?.get("x-real-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0];
  return (raw ?? "unknown").trim().slice(0, 64) || "unknown";
}

function supabaseStore(db: AdminDb): AttemptStore {
  const empty = (): LimiterState => ({ rev: 0, entries: {} });
  return {
    async load() {
      const { data, error } = await db.from("settings").select("data").eq("id", LIMITER_ID).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        const created = await db
          .from("settings")
          .upsert({ id: LIMITER_ID, data: empty() as unknown as Json }, { onConflict: "id", ignoreDuplicates: true });
        if (created.error) throw new Error(created.error.message);
        return empty();
      }
      const stored = data.data as unknown as Partial<LimiterState> | null;
      return { rev: Number(stored?.rev) || 0, entries: stored?.entries ?? {} };
    },
    async swap(expectedRev, next) {
      const { data, error } = await db
        .from("settings")
        .update({ data: next as unknown as Json })
        .eq("id", LIMITER_ID)
        .eq("data->>rev", String(expectedRev))
        .select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

interface OwnerSecrets {
  data: Record<string, unknown>;
  hash: string | undefined;
  /** Pre-hardening plaintext password; migrated to a hash on the next successful login. */
  legacy: string | undefined;
}

async function readSecrets(db: AdminDb): Promise<OwnerSecrets> {
  const { data, error } = await db.from("settings").select("data").eq("id", SETTINGS_ID).maybeSingle();
  if (error) throw new Error(error.message);
  const stored = (data?.data ?? {}) as Record<string, unknown>;
  const hash = typeof stored["owner_password_hash"] === "string" && stored["owner_password_hash"] ? stored["owner_password_hash"] : undefined;
  const legacy = typeof stored["owner_password"] === "string" && stored["owner_password"] ? stored["owner_password"] : undefined;
  return { data: stored, hash, legacy };
}

function sessionSecret(): string {
  const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor");
  return secret;
}

async function issueSession(hash: string) {
  const expiresAt = Date.now() + SESSION_HOURS * 3_600_000;
  const token = await signSession({ exp: expiresAt, ph: await fingerprint(hash) }, sessionSecret());
  return { token, expiresAt };
}

async function writeSecrets(db: AdminDb, data: Record<string, unknown>, onlyIfNoHash = false) {
  let query = db.from("settings").update({ data: data as unknown as Json }).eq("id", SETTINGS_ID);
  if (onlyIfNoHash) query = query.is("data->>owner_password_hash", null);
  const { data: rows, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return (rows?.length ?? 0) > 0;
}

export async function ownerConfigured(): Promise<boolean> {
  const { hash, legacy } = await readSecrets(await adminDb());
  return Boolean(hash || legacy);
}

/** Creates the first password. Refuses once any password exists. */
export async function setupOwner(password: string) {
  const db = await adminDb();
  const { data, hash, legacy } = await readSecrets(db);
  if (hash || legacy) throw new Error("La contraseña ya está configurada. Inicia sesión.");
  const newHash = await hashPassword(password);
  const next: Record<string, unknown> = { ...data, owner_password_hash: newHash };
  delete next["owner_password"];
  let won: boolean;
  if (Object.keys(data).length) won = await writeSecrets(db, next, true);
  else {
    // Fresh database without the settings row: insert it (primary key makes concurrent setups lose).
    const inserted = await db.from("settings").insert({ id: SETTINGS_ID, data: next as Json });
    won = !inserted.error;
  }
  if (!won) throw new Error("La contraseña ya está configurada. Inicia sesión.");
  return issueSession(newHash);
}

export async function loginOwner(password: string) {
  const db = await adminDb();
  const store = supabaseStore(db);
  const ipKey = `owner:ip:${clientIp()}`;
  await consumeAttempt(store, ipKey, OWNER_IP);
  await consumeAttempt(store, "owner:all", OWNER_ALL);

  const { data, hash, legacy } = await readSecrets(db);
  if (!hash && !legacy) throw new Error("Aún no hay contraseña: créala primero.");

  let currentHash = hash;
  let ok: boolean;
  let weak = false;
  if (hash) ok = await verifyPassword(password, hash);
  else {
    ok = safeEqualText(password, legacy ?? "");
    if (ok) {
      // One-time migration of the old plaintext password to a salted hash.
      currentHash = await hashPassword(password);
      const next: Record<string, unknown> = { ...data, owner_password_hash: currentHash };
      delete next["owner_password"];
      await writeSecrets(db, next);
      weak = password.length < PASSWORD_MIN;
    }
  }
  if (!ok || !currentHash) throw new Error("Contraseña incorrecta");
  await clearAttempts(store, ipKey);
  return { ...(await issueSession(currentHash)), weak };
}

/** Validates a session token and returns the admin client. Every owner endpoint starts here. */
export async function requireOwner(token: string): Promise<AdminDb> {
  const db = await adminDb();
  const { hash } = await readSecrets(db);
  const claims = hash ? await verifySession(token, sessionSecret()) : null;
  if (!hash || !claims || claims.ph !== (await fingerprint(hash))) throw new Error(AUTH_REQUIRED);
  return db;
}

export async function changeOwnerPassword(token: string, current: string, next: string) {
  const db = await requireOwner(token);
  const store = supabaseStore(db);
  const key = `owner:ip:${clientIp()}`;
  await consumeAttempt(store, key, OWNER_IP);
  const { data, hash } = await readSecrets(db);
  if (!hash || !(await verifyPassword(current, hash))) throw new Error("La contraseña actual no es correcta");
  await clearAttempts(store, key);
  const newHash = await hashPassword(next);
  await writeSecrets(db, { ...data, owner_password_hash: newHash });
  return issueSession(newHash);
}

export async function readOwnerSettingsRow(db: AdminDb): Promise<Record<string, unknown>> {
  return (await readSecrets(db)).data;
}

export async function saveOwnerSettingsRow(db: AdminDb, data: Record<string, unknown>) {
  const { error } = await db.from("settings").upsert({ id: SETTINGS_ID, data: data as unknown as Json });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export interface PortalMember {
  id: string;
  first_name: string;
  schedule: Record<string, string>;
  active: boolean;
}

const BAD_CREDENTIALS = "Teléfono o PIN incorrectos";

export async function authenticateMember(phone: string, pin: string): Promise<{ db: AdminDb; member: PortalMember }> {
  const db = await adminDb();
  const store = supabaseStore(db);
  const ipKey = `m:ip:${clientIp()}`;
  await assertNotLocked(store, ipKey);
  await assertNotLocked(store, "m:all");
  // The per-phone counter is spent before the PIN is checked: parallel guesses cannot exceed the budget.
  const phoneKey = `m:phone:${phone}`;
  await consumeAttempt(store, phoneKey, MEMBER_PHONE);

  const { data, error } = await db.from("members").select("id, first_name, schedule, active, pin").eq("phone", phone).maybeSingle();
  if (error) throw new Error(error.message);
  // Same work and same message whether the phone exists or not.
  const stored = data?.pin ?? "";
  const ok = safeEqualText(pin, stored) && Boolean(data);
  if (!ok || !data) {
    await recordFailure(store, ipKey, MEMBER_IP);
    await recordFailure(store, "m:all", MEMBER_ALL);
    throw new Error(BAD_CREDENTIALS);
  }
  await clearAttempts(store, phoneKey);
  if (!data.active) throw new Error("Tu ficha está inactiva. Contacta con el centro.");
  return { db, member: { id: data.id, first_name: data.first_name, schedule: (data.schedule ?? {}) as Record<string, string>, active: data.active } };
}

/** Cap on write endpoints that are reachable with valid credentials (avoids request spam). */
export async function limitMemberWrites(db: AdminDb) {
  await consumeAttempt(supabaseStore(db), `m:write:${clientIp()}`, REQUEST_IP);
}
