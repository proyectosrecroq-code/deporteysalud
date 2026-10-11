// All data access goes through these server functions (admin client, RLS closed to the browser).
// Every owner endpoint needs a signed session token; every payload is validated before touching the DB.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import { AUTH_REQUIRED } from "./auth-errors";
import { importRowSchema, MAX_IMPORT_ROWS, planMemberImport } from "./import-members";
import {
  allowedTimes,
  madridISO,
  madridToday,
  toMin,
  validateAssignment,
  weekSchedules,
} from "./schedule";
import { canRecordLoad } from "./workout-loads";
import {
  OWNER_SCHEMAS,
  OWNER_TABLES,
  WEEKDAY_CODES,
  type OwnerTable,
  conditionSchema,
  exerciseSchema,
  loginPin,
  memberSchema,
  parseOrThrow,
  passwordStr,
  paymentSchema,
  phoneStr,
  requestSchema,
  settingsSchema,
  timeStr,
  workoutSchema,
} from "./validation";

type Row = { [key: string]: Json };
type Plain = Record<string, unknown>;
const PAGE = 1000;

/** Validates with zod but reports a readable Spanish message instead of a JSON dump. */
const input =
  <S extends z.ZodType>(schema: S) =>
  (value: unknown) =>
    parseOrThrow(schema, value);

const token = z.string().min(20, AUTH_REQUIRED).max(2000, AUTH_REQUIRED);

async function auth() {
  return import("./auth.server");
}

const loose = (db: unknown) => db as SupabaseClient;

function dbError(error: { code?: string; message: string }): Error {
  console.error("[db]", error.code, error.message);
  if (error.code === "23505")
    return new Error("Ya existe un registro con esos datos (por ejemplo, un teléfono repetido).");
  if (error.code === "23503")
    return new Error("El registro hace referencia a datos que no existen.");
  return new Error("No se pudo guardar en la base de datos.");
}

async function fetchAll(db: SupabaseClient, table: string, columns = "*"): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw dbError(error);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const DEFAULT_SETTINGS = {
  capacity: 6,
  overlap_max: 1,
  tariffs: { "2": 90, "3": 120, "4": 150 },
  open_days: ["L", "M", "X", "J", "V"],
  class_times: [
    "07:30",
    "08:30",
    "09:30",
    "10:30",
    "11:30",
    "16:30",
    "17:30",
    "18:30",
    "19:30",
    "20:30",
  ],
  payment_methods: ["BIZUM", "EFECTIVO", "TARJETA", "TRANSFERENCIA"],
  exercise_categories: ["Calentamiento", "Activación", "Fuerza", "Aeróbico", "Core", "Movilidad"],
};
type PublicSettings = typeof DEFAULT_SETTINGS;

/** Settings the browser may see/edit: never the password hash or the limiter state. */
function publicSettings(raw: Plain): PublicSettings {
  const out: Plain = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (raw[key] !== undefined) out[key] = raw[key];
  return out as unknown as PublicSettings;
}

// ---------------------------------------------------------------------------
// Owner session
// ---------------------------------------------------------------------------

export const ownerStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { ownerConfigured } = await auth();
  return { configured: await ownerConfigured() };
});

export const ownerSetup = createServerFn({ method: "POST" })
  .validator(input(z.object({ password: passwordStr })))
  .handler(async ({ data }) => (await auth()).setupOwner(data.password));

export const ownerLogin = createServerFn({ method: "POST" })
  .validator(input(z.object({ password: z.string().min(1, "Introduce la contraseña").max(128) })))
  .handler(async ({ data }) => (await auth()).loginOwner(data.password));

export const ownerChangePassword = createServerFn({ method: "POST" })
  .validator(input(z.object({ token, current: z.string().min(1).max(128), next: passwordStr })))
  .handler(async ({ data }) =>
    (await auth()).changeOwnerPassword(data.token, data.current, data.next),
  );

// ---------------------------------------------------------------------------
// Owner data
// ---------------------------------------------------------------------------

export const ownerLoad = createServerFn({ method: "POST" })
  .validator(input(z.object({ token })))
  .handler(async ({ data }) => {
    const { requireOwner, readOwnerSettingsRow } = await auth();
    const admin = await requireOwner(data.token);
    const db = loose(admin);
    const out: Record<string, Row[]> = {};
    for (const t of OWNER_TABLES) out[t] = await fetchAll(db, t);
    out["settings"] = [{ id: 1, data: publicSettings(await readOwnerSettingsRow(admin)) }];
    return out;
  });

async function assertScheduleFits(
  db: SupabaseClient,
  row: z.output<typeof memberSchema>,
  settings: PublicSettings,
) {
  if (!row.active) return;
  const all = (await fetchAll(db, "members", "id, active, schedule")) as {
    id: string;
    active: boolean;
    schedule: Record<string, string>;
  }[];
  const current = row.id ? all.find((m) => m.id === row.id) : undefined;
  const allowed = allowedTimes(settings.class_times);
  for (const [day, time] of Object.entries(row.schedule)) {
    if (current?.schedule?.[day] !== time) {
      if (!settings.open_days.includes(day)) throw new Error(`El centro no abre el ${day}.`);
      if (!allowed.includes(time as string)) throw new Error(`${time} no es una hora de clase.`);
    }
    const err = validateAssignment(
      all,
      row.id ?? null,
      day,
      time as string,
      settings.capacity,
      settings.overlap_max,
    );
    if (err) throw new Error(err);
  }
}

export const ownerMutate = createServerFn({ method: "POST" })
  .validator(
    input(
      z.object({
        token,
        table: z.enum(OWNER_TABLES),
        action: z.enum(["upsert", "delete", "deleteAll", "insertMany"]),
        rows: z.array(z.record(z.string(), z.unknown())).max(5000).optional(),
        id: z.string().uuid().optional(),
        onConflict: z.literal("member_id,month").optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { requireOwner, readOwnerSettingsRow } = await auth();
    const admin = await requireOwner(data.token);
    const db = loose(admin);
    const table: OwnerTable = data.table;

    if (data.action === "delete") {
      if (!data.id) throw new Error("Falta el identificador.");
      const { error } = await db.from(table).delete().eq("id", data.id);
      if (error) throw dbError(error);
      return { rows: [] as Row[] };
    }
    if (data.action === "deleteAll") {
      if (!["members", "exercises", "conditions"].includes(table))
        throw new Error("Operación no permitida para esta tabla.");
      const { error } = await db.from(table).delete().not("id", "is", null);
      if (error) throw dbError(error);
      return { rows: [] as Row[] };
    }

    if (!data.rows?.length) return { rows: [] as Row[] };
    if (data.onConflict && table !== "payments")
      throw new Error("onConflict solo se admite en pagos.");
    const schema = OWNER_SCHEMAS[table] as z.ZodType<Plain>;
    let rows: Plain[] = data.rows.map((r, i) =>
      parseOrThrow(schema, r, data.rows!.length > 1 ? `Fila ${i + 1}` : "Datos"),
    );

    if (table === "members") {
      const settings = publicSettings(await readOwnerSettingsRow(admin));
      for (const r of rows)
        await assertScheduleFits(db, r as z.output<typeof memberSchema>, settings);
    }
    if (table === "workouts") {
      const today = madridISO();
      rows = (rows as z.output<typeof workoutSchema>[]).map((w) =>
        canRecordLoad(w.date, today)
          ? w
          : {
              ...w,
              blocks: w.blocks.map((b) => ({
                ...b,
                items: b.items.map(({ recordedLoad: _drop, ...item }) => item),
              })),
            },
      );
    }
    if (data.action === "insertMany" && (table === "exercises" || table === "conditions")) {
      const existing = await fetchAll(db, table, "name");
      const names = new Set(existing.map((e) => String(e["name"]).toLowerCase()));
      rows = rows.filter((r) => {
        const key = String(r["name"]).toLowerCase();
        if (names.has(key)) return false;
        names.add(key);
        return true;
      });
      if (!rows.length) return { rows: [] as Row[] };
    }

    const saved: Row[] = [];
    if (data.action === "insertMany") {
      const { data: out, error } = await db.from(table).insert(rows).select();
      if (error) throw dbError(error);
      saved.push(...((out ?? []) as Row[]));
    } else {
      // One row per call: bulk upserts with different key sets would null out the missing columns.
      for (const r of rows) {
        const { data: out, error } = await db
          .from(table)
          .upsert(r, data.onConflict ? { onConflict: data.onConflict } : undefined)
          .select();
        if (error) throw dbError(error);
        saved.push(...((out ?? []) as Row[]));
      }
    }
    return { rows: saved };
  });

export const ownerSaveSettings = createServerFn({ method: "POST" })
  .validator(input(z.object({ token, settings: settingsSchema })))
  .handler(async ({ data }) => {
    const { requireOwner, readOwnerSettingsRow, saveOwnerSettingsRow } = await auth();
    const db = await requireOwner(data.token);
    // Merge into the stored document so the password hash is never touched by the browser.
    await saveOwnerSettingsRow(db, { ...(await readOwnerSettingsRow(db)), ...data.settings });
    return { ok: true };
  });

export const ownerImportMembers = createServerFn({ method: "POST" })
  .validator(input(z.object({ token, rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS) })))
  .handler(async ({ data }) => {
    const { requireOwner, readOwnerSettingsRow } = await auth();
    const { randomPin } = await import("./auth-core.server");
    const { isWeakPin } = await import("./validation");
    const admin = await requireOwner(data.token);
    const db = loose(admin);
    const s = publicSettings(await readOwnerSettingsRow(admin));
    const members = (await fetchAll(db, "members", "id, phone, active, schedule")) as unknown as {
      id: string;
      phone: string;
      active: boolean;
      schedule: Record<string, string>;
    }[];
    const conditions = (await fetchAll(db, "conditions", "name")).map((c) => String(c["name"]));
    const plan = planMemberImport(data.rows, {
      members,
      conditions,
      tariffs: s.tariffs,
      openDays: s.open_days,
      classTimes: s.class_times,
      capacity: s.capacity,
      overlapMax: s.overlap_max,
      today: madridISO(),
    });

    const errors = [...plan.errors];
    let inserted = 0;
    /** PINs the owner has to hand out: only those generated here. */
    const generated: { name: string; phone: string; pin: string }[] = [];
    for (const { row, values } of plan.inserts) {
      let pin = values.pin ?? randomPin();
      while (!values.pin && isWeakPin(pin)) pin = randomPin();
      const { error } = await db.from("members").insert({ ...values, pin });
      if (error) {
        console.error("[import]", row, error.code, error.message);
        errors.push({
          row,
          phone: values.phone,
          message: error.code === "23505" ? "El teléfono ya existe" : "No se pudo guardar la fila",
        });
        continue;
      }
      inserted++;
      if (!values.pin)
        generated.push({
          name: `${values.first_name} ${values.last_name}`.trim(),
          phone: values.phone,
          pin,
        });
    }
    let updated = 0;
    for (const { row, id, patch } of plan.updates) {
      const { error } = await db.from("members").update(patch).eq("id", id);
      if (error) {
        console.error("[import]", row, error.code, error.message);
        errors.push({ row, phone: "", message: "No se pudo actualizar la fila" });
      } else updated++;
    }
    errors.sort((a, b) => a.row - b.row);
    return { inserted, updated, errors, generated };
  });

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

const restoreMember = memberSchema.extend({
  id: z.string().uuid(),
  pin: loginPin,
  created_at: z.string().max(40).optional(),
});
const backupSchema = z.object({
  members: z.array(restoreMember).max(5000).default([]),
  payments: z
    .array(paymentSchema.extend({ id: z.string().uuid() }))
    .max(20000)
    .default([]),
  exercises: z
    .array(exerciseSchema.extend({ id: z.string().uuid() }))
    .max(5000)
    .default([]),
  workouts: z
    .array(
      workoutSchema.extend({ id: z.string().uuid(), created_at: z.string().max(40).optional() }),
    )
    .max(20000)
    .default([]),
  conditions: z
    .array(conditionSchema.extend({ id: z.string().uuid() }))
    .max(2000)
    .default([]),
  member_requests: z
    .array(
      requestSchema.extend({ id: z.string().uuid(), created_at: z.string().max(40).optional() }),
    )
    .max(20000)
    .default([]),
  settings: z
    .array(z.object({ data: z.record(z.string(), z.unknown()) }))
    .max(2)
    .default([]),
});

const DELETE_ORDER = [
  "member_requests",
  "workouts",
  "payments",
  "members",
  "exercises",
  "conditions",
] as const;
const INSERT_ORDER = [
  "members",
  "payments",
  "workouts",
  "member_requests",
  "exercises",
  "conditions",
] as const;

async function wipe(db: SupabaseClient) {
  for (const t of DELETE_ORDER) {
    const { error } = await db.from(t).delete().not("id", "is", null);
    if (error) throw dbError(error);
  }
}
async function fill(db: SupabaseClient, data: Record<string, Row[]>) {
  for (const t of INSERT_ORDER) {
    const rows = data[t] ?? [];
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(t).insert(rows.slice(i, i + 500));
      if (error) throw dbError(error);
    }
  }
}

function assertBackupConsistent(b: z.output<typeof backupSchema>) {
  const ids = new Set(b.members.map((m) => m.id));
  if (ids.size !== b.members.length)
    throw new Error("La copia tiene socios con identificador repetido.");
  if (new Set(b.members.map((m) => m.phone)).size !== b.members.length)
    throw new Error("La copia tiene teléfonos repetidos.");
  for (const list of [b.payments, b.workouts, b.member_requests])
    for (const r of list)
      if (!ids.has(r.member_id))
        throw new Error("La copia tiene registros de socios que no existen en ella.");
  if (new Set(b.payments.map((p) => `${p.member_id}|${p.month}`)).size !== b.payments.length)
    throw new Error("La copia tiene pagos repetidos para el mismo mes.");
}

export const ownerRestore = createServerFn({ method: "POST" })
  .validator(input(z.object({ token, backup: z.record(z.string(), z.unknown()) })))
  .handler(async ({ data }) => {
    const { requireOwner, readOwnerSettingsRow, saveOwnerSettingsRow } = await auth();
    const owner = await requireOwner(data.token);
    const db = loose(owner);
    // 1) Validate everything before touching the database.
    const backup = parseOrThrow(backupSchema, data.backup, "Copia de seguridad");
    assertBackupConsistent(backup);
    const incoming = backup.settings[0]
      ? settingsSchema.safeParse(publicSettings(backup.settings[0].data))
      : null;

    // 2) Snapshot, replace, and put the snapshot back if anything fails halfway.
    const snapshot: Record<string, Row[]> = {};
    for (const t of INSERT_ORDER) snapshot[t] = await fetchAll(db, t);
    try {
      await wipe(db);
      await fill(db, backup as unknown as Record<string, Row[]>);
    } catch (e) {
      try {
        await wipe(db);
        await fill(db, snapshot);
      } catch (rollback) {
        console.error("[restore] rollback failed", rollback);
        throw new Error(
          "La restauración falló y no se pudieron recuperar los datos anteriores. No cierres esta pantalla y contacta con soporte.",
        );
      }
      throw new Error(
        `La restauración falló; se han recuperado los datos anteriores. Motivo: ${(e as Error).message}`,
      );
    }
    if (incoming?.success)
      await saveOwnerSettingsRow(owner, {
        ...(await readOwnerSettingsRow(owner)),
        ...incoming.data,
      });
    return { ok: true, members: backup.members.length };
  });

// ---------------------------------------------------------------------------
// Member portal
// ---------------------------------------------------------------------------

const memberCreds = z.object({ phone: phoneStr, pin: loginPin });

export const memberPortal = createServerFn({ method: "POST" })
  .validator(input(memberCreds))
  .handler(async ({ data }) => {
    const { authenticateMember } = await auth();
    const { readOwnerSettingsRow } = await auth();
    const { db, member } = await authenticateMember(data.phone, data.pin);
    const client = loose(db);
    const times = allowedTimes(publicSettings(await readOwnerSettingsRow(db)).class_times);
    const everyone = (await fetchAll(client, "members", "id, first_name, schedule, active")).filter(
      (m) => m["active"],
    ) as unknown as {
      id: string;
      first_name: string;
      active: boolean;
      schedule: Record<string, string>;
    }[];
    const approved = (
      await fetchAll(
        client,
        "member_requests",
        "member_id, type, day, desired_time, status, created_at",
      )
    ).filter((r) => r["status"] === "aprobado") as unknown as Parameters<typeof weekSchedules>[1];
    // Same rules as the owner's agenda: approved absences/changes of this week apply to everybody.
    const week = weekSchedules(everyone, approved, madridToday());
    const me = week.find((m) => m.id === member.id);

    const sessions = Object.entries(me?.schedule ?? {}).map(([day, time]) => {
      const t = toMin(time);
      const mates = week
        .filter(
          (o) =>
            o.id !== member.id && o.schedule[day] && Math.abs(toMin(o.schedule[day]!) - t) < 60,
        )
        .map((o) => o.first_name); // first name only (data protection)
      return { day, time, mates };
    });
    const { data: reqs, error } = await client
      .from("member_requests")
      .select("id,type,day,desired_time,message,status,created_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw dbError(error);
    return { name: member.first_name, sessions, times, requests: (reqs ?? []) as Row[] };
  });

export const memberRequest = createServerFn({ method: "POST" })
  .validator(
    input(
      memberCreds.extend({
        type: z.enum(["cambio", "ausencia"]),
        day: z.enum(WEEKDAY_CODES),
        desired_time: timeStr.optional(),
        message: z.string().trim().min(1, "Escribe el motivo").max(500),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { authenticateMember, limitMemberWrites, readOwnerSettingsRow } = await auth();
    const { db, member } = await authenticateMember(data.phone, data.pin);
    await limitMemberWrites(db);
    const client = loose(db);
    const current = member.schedule[data.day];
    if (!current) throw new Error("No tienes sesión ese día.");
    if (data.type === "cambio") {
      if (!data.desired_time) throw new Error("Indica la hora que prefieres.");
      const s = publicSettings(await readOwnerSettingsRow(db));
      if (!allowedTimes(s.class_times).includes(data.desired_time))
        throw new Error("Esa hora no es de clase.");
      if (data.desired_time === current) throw new Error("Ya tienes sesión a esa hora.");
    }
    const { data: pending, error: pendingError } = await client
      .from("member_requests")
      .select("id,type,day")
      .eq("member_id", member.id)
      .eq("status", "pendiente");
    if (pendingError) throw dbError(pendingError);
    if ((pending?.length ?? 0) >= 5)
      throw new Error("Tienes demasiados avisos pendientes. Espera a que el centro los revise.");
    if (pending?.some((p) => p.day === data.day && p.type === data.type))
      throw new Error("Ya tienes un aviso pendiente igual para ese día.");

    const { error } = await client.from("member_requests").insert({
      member_id: member.id,
      type: data.type,
      day: data.day,
      desired_time: data.type === "cambio" ? (data.desired_time ?? null) : null,
      message: data.message,
    });
    if (error) throw dbError(error);
    return { ok: true };
  });
