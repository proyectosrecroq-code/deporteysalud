// Shared (client + server) input validation. The server never trusts what the browser sends:
// every owner/member payload is parsed here and unknown columns are dropped.
import { z } from "zod";

export const DAY_CODES = ["L", "M", "X", "J", "V", "S", "D"] as const;
export const WEEKDAY_CODES = ["L", "M", "X", "J", "V"] as const;
export const OWNER_TABLES = ["members", "payments", "exercises", "workouts", "conditions", "member_requests"] as const;
export type OwnerTable = (typeof OWNER_TABLES)[number];

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export const normalizePhone = (value: string) => value.replace(/[\s.\-()]/g, "");

export const WEAK_PINS = new Set(["0000", "1234", "4321", "2580", "1212", "2000", "1004", "1010"]);
export function isWeakPin(pin: string): boolean {
  if (WEAK_PINS.has(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  return "0123456789".includes(pin) || "9876543210".includes(pin);
}

export const dateStr = z.string().refine(isRealDate, "Fecha no válida (AAAA-MM-DD)");
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)");
export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido (AAAA-MM)");
export const phoneStr = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+?\d{6,15}$/, "Teléfono no válido (6-15 dígitos)"));
/** PIN accepted at login: legacy 4-digit PINs keep working. */
export const loginPin = z.string().trim().regex(/^\d{4,8}$/, "PIN no válido");
/** PIN accepted when the owner writes one: no trivial PINs. */
export const newPin = loginPin.refine((p) => !isWeakPin(p), "PIN demasiado fácil de adivinar (evita 0000, 1234, repetidos o secuencias)");
export const passwordStr = z
  .string()
  .min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`)
  .max(PASSWORD_MAX, `La contraseña no puede superar ${PASSWORD_MAX} caracteres`);

const uuid = z.string().uuid("Identificador no válido");
const text = (max: number) => z.string().trim().max(max);
const scheduleSchema = z.partialRecord(z.enum(DAY_CODES), timeStr);

export const memberSchema = z.object({
  id: uuid.optional(),
  first_name: text(100).min(1, "El nombre es obligatorio"),
  last_name: text(150).default(""),
  phone: phoneStr,
  pin: newPin,
  birth_date: dateStr.nullable().optional(),
  join_date: dateStr,
  active: z.boolean(),
  plan_days: z.number().int().min(1).max(7),
  schedule: scheduleSchema,
  conditions: z.array(text(120)).max(100),
  notes: z.string().max(5000).default(""),
  consent: z.boolean(),
  consent_date: dateStr.nullable().optional(),
  recovery_sessions: z.number().int().min(0).max(999).optional(),
  recovery_notes: z.string().max(500).optional(),
});

export const paymentSchema = z.object({
  id: uuid.optional(),
  member_id: uuid,
  month: monthStr,
  amount: z.number().min(0).max(100000),
  method: text(40).nullable(),
  paid: z.boolean(),
  paid_at: z.string().max(40).nullable().optional(),
});

export const exerciseSchema = z.object({
  id: uuid.optional(),
  name: text(120).min(1, "El nombre es obligatorio"),
  category: text(60).min(1, "La categoría es obligatoria"),
});

export const conditionSchema = z.object({
  id: uuid.optional(),
  name: text(120).min(1, "El nombre es obligatorio"),
  kind: z.enum(["lesion", "patologia", "condicion", "objetivo"]),
});

const recordedLoad = z.string().regex(/^(\d{1,4}([.,]\d{1,2})?)?$/, "Peso no válido");
const workoutItem = z.object({
  name: text(120).min(1),
  sets: text(30).optional(),
  reps: text(60).optional(),
  load: text(30).optional(),
  recordedLoad: recordedLoad.optional(),
});
export const workoutSchema = z.object({
  id: uuid.optional(),
  member_id: uuid,
  date: dateStr,
  type: text(30),
  title: text(200).min(1, "El título es obligatorio"),
  blocks: z.array(z.object({ block: text(120), items: z.array(workoutItem).max(60) })).max(30),
});

export const requestSchema = z.object({
  id: uuid.optional(),
  member_id: uuid,
  type: z.enum(["cambio", "ausencia"]),
  day: z.enum(DAY_CODES).nullable().optional(),
  desired_time: timeStr.nullable().optional(),
  message: text(500),
  status: z.enum(["pendiente", "aprobado", "rechazado"]),
});

export const settingsSchema = z.object({
  capacity: z.number().int().min(1).max(50),
  overlap_max: z.number().int().min(0).max(5),
  tariffs: z.record(z.string().regex(/^[1-7]$/), z.number().min(0).max(10000)),
  open_days: z.array(z.enum(DAY_CODES)).min(1),
  class_times: z.array(timeStr).min(1).max(40),
  payment_methods: z.array(text(40).min(1)).min(1).max(20),
  exercise_categories: z.array(text(60).min(1)).min(1).max(30),
});
export type PublicSettings = z.infer<typeof settingsSchema>;

export const OWNER_SCHEMAS = {
  members: memberSchema,
  payments: paymentSchema,
  exercises: exerciseSchema,
  workouts: workoutSchema,
  conditions: conditionSchema,
  member_requests: requestSchema,
} as const;

/** Parse or throw an Error whose message is readable in a toast (Spanish, first issue only). */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, label = "Datos"): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.length ? ` (${issue.path.join(".")})` : "";
  throw new Error(`${label} no válidos${path}: ${issue?.message ?? "formato incorrecto"}`);
}
