// Pure, runtime-agnostic security primitives (WebCrypto only: works on Node and Cloudflare Workers).
// Kept free of Supabase/request access so it can be unit-tested.

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Cloudflare Workers cap PBKDF2 at 100k iterations, so this is the strongest portable value. */
export const PBKDF2_ITERATIONS = 100_000;

export function toB64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(value: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export const safeEqualText = (a: string, b: string) =>
  constantTimeEqual(enc.encode(a), enc.encode(b));

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toB64u(salt)}$${toB64u(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  const rounds = Number(iterations);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(rounds) || rounds < 1 || !salt || !hash)
    return false;
  try {
    const candidate = await pbkdf2(password, fromB64u(salt), rounds);
    return constantTimeEqual(candidate, fromB64u(hash));
  } catch {
    return false;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Short stable id of a secret value; lets a session die when the password hash changes. */
export async function fingerprint(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
  return toB64u(digest).slice(0, 22);
}

export interface SessionClaims {
  exp: number;
  ph: string;
}

const SESSION_CONTEXT = "owner-session-v1";

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const body = toB64u(enc.encode(JSON.stringify(claims)));
  return `${body}.${toB64u(await hmac(secret, `${SESSION_CONTEXT}.${body}`))}`;
}

export async function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<SessionClaims | null> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const expected = await hmac(secret, `${SESSION_CONTEXT}.${body}`);
    if (!constantTimeEqual(expected, fromB64u(sig))) return null;
    const claims = JSON.parse(dec.decode(fromB64u(body))) as Partial<SessionClaims>;
    if (typeof claims.exp !== "number" || typeof claims.ph !== "string" || claims.exp <= now)
      return null;
    return { exp: claims.exp, ph: claims.ph };
  } catch {
    return null;
  }
}

/** Uniformly random numeric PIN (rejection sampling, no modulo bias). */
export function randomPin(digits = 6): string {
  let pin = "";
  const limit = 256 - (256 % 10);
  while (pin.length < digits) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && pin.length < digits) pin += String(b % 10);
    }
  }
  return pin;
}

// ---------------------------------------------------------------------------
// Persistent attempt limiter. State is one small document updated with
// compare-and-swap on `rev`, so parallel requests cannot slip extra guesses past the counter.
// ---------------------------------------------------------------------------

export interface LimitEntry {
  n: number;
  /** Epoch ms when the counter (or the lock) is forgotten. */
  reset: number;
  locked?: boolean;
}
export interface LimiterState {
  rev: number;
  entries: Record<string, LimitEntry>;
}
export interface AttemptStore {
  load(): Promise<LimiterState>;
  /** Writes `next` only if the stored revision still equals `expectedRev`. */
  swap(expectedRev: number, next: LimiterState): Promise<boolean>;
}
export interface Rule {
  max: number;
  windowMs: number;
  lockMs: number;
}

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    super(`Demasiados intentos. Inténtalo de nuevo en ${minutes} min.`);
    this.name = "RateLimitError";
  }
}

const MAX_ENTRIES = 1000;
const MAX_RETRIES = 8;

const live = (e: LimitEntry | undefined, now: number) => (e && e.reset > now ? e : undefined);

function prune(entries: Record<string, LimitEntry>, now: number): Record<string, LimitEntry> {
  const kept = Object.entries(entries).filter(([, e]) => e.reset > now);
  if (kept.length > MAX_ENTRIES) {
    // Under a spraying attack keep locks, drop the oldest plain counters first.
    kept.sort(([, a], [, b]) => Number(!!b.locked) - Number(!!a.locked) || b.reset - a.reset);
    kept.length = MAX_ENTRIES;
  }
  return Object.fromEntries(kept);
}

interface Outcome {
  blocked: boolean;
  retryAfterMs: number;
}

async function mutate(
  store: AttemptStore,
  fn: (
    entries: Record<string, LimitEntry>,
    now: number,
  ) => { entries: Record<string, LimitEntry> | null; outcome: Outcome },
): Promise<Outcome> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const state = await store.load();
    const now = Date.now();
    const { entries, outcome } = fn({ ...state.entries }, now);
    if (!entries) return outcome;
    if (await store.swap(state.rev, { rev: state.rev + 1, entries: prune(entries, now) }))
      return outcome;
  }
  // Heavy contention means somebody is hammering the endpoint: fail closed.
  throw new RateLimitError(10_000);
}

/** Counts the attempt *before* it is verified, so a burst of parallel guesses cannot exceed `rule.max`. */
export async function consumeAttempt(store: AttemptStore, key: string, rule: Rule): Promise<void> {
  const outcome = await mutate(store, (entries, now) => {
    const e = live(entries[key], now);
    if (e?.locked)
      return { entries: null, outcome: { blocked: true, retryAfterMs: e.reset - now } };
    const n = (e?.n ?? 0) + 1;
    if (n > rule.max) {
      entries[key] = { n, reset: now + rule.lockMs, locked: true };
      return { entries, outcome: { blocked: true, retryAfterMs: rule.lockMs } };
    }
    entries[key] = { n, reset: e?.reset ?? now + rule.windowMs };
    return { entries, outcome: { blocked: false, retryAfterMs: 0 } };
  });
  if (outcome.blocked) throw new RateLimitError(outcome.retryAfterMs);
}

/** Read-only lock check (used with failure-only counters). */
export async function assertNotLocked(store: AttemptStore, key: string): Promise<void> {
  const state = await store.load();
  const e = live(state.entries[key], Date.now());
  if (e?.locked) throw new RateLimitError(e.reset - Date.now());
}

/** Counts a failed attempt; locks the key when the rule is exceeded. Never throws on lock. */
export async function recordFailure(store: AttemptStore, key: string, rule: Rule): Promise<void> {
  try {
    await mutate(store, (entries, now) => {
      const e = live(entries[key], now);
      if (e?.locked)
        return { entries: null, outcome: { blocked: true, retryAfterMs: e.reset - now } };
      const n = (e?.n ?? 0) + 1;
      entries[key] =
        n >= rule.max
          ? { n, reset: now + rule.lockMs, locked: true }
          : { n, reset: e?.reset ?? now + rule.windowMs };
      return { entries, outcome: { blocked: false, retryAfterMs: 0 } };
    });
  } catch (e) {
    if (!(e instanceof RateLimitError)) throw e;
  }
}

export async function clearAttempts(store: AttemptStore, key: string): Promise<void> {
  const ok: Outcome = { blocked: false, retryAfterMs: 0 };
  try {
    await mutate(store, (entries) => {
      if (!entries[key]) return { entries: null, outcome: ok };
      delete entries[key];
      return { entries, outcome: ok };
    });
  } catch {
    // Best effort: a stale counter only makes the next attempt stricter.
  }
}

export function memoryStore(initial?: LimiterState): AttemptStore & { state: LimiterState } {
  const store = {
    state: initial ?? { rev: 0, entries: {} },
    async load() {
      return structuredClone(store.state);
    },
    async swap(expectedRev: number, next: LimiterState) {
      if (store.state.rev !== expectedRev) return false;
      store.state = structuredClone(next);
      return true;
    },
  };
  return store;
}
