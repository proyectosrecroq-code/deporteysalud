// Excel import planning. Pure on purpose: the browser uses it for the preview and the server runs the
// very same function again on the raw rows, so what the owner sees is what gets written.
import { z } from "zod";
import { WEEKDAY_CODES, isRealDate, isWeakPin, loginPin, normalizePhone } from "./validation";
import { allowedTimes, validateAssignment, type SchedMember } from "./schedule";

type Weekday = (typeof WEEKDAY_CODES)[number];

/** One spreadsheet row, every cell kept as text. */
export const importRowSchema = z.object({
  row: z.number().int().min(1).max(100000),
  first_name: z.string().max(100),
  last_name: z.string().max(150),
  phone: z.string().max(40),
  pin: z.string().max(20),
  birth_date: z.string().max(40),
  join_date: z.string().max(40),
  plan_days: z.string().max(10),
  times: z.partialRecord(z.enum(WEEKDAY_CODES), z.string().max(20)),
  conditions: z.string().max(1000),
  notes: z.string().max(5000),
});
export type ImportRow = z.infer<typeof importRowSchema>;
export const MAX_IMPORT_ROWS = 2000;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const cell = (v: unknown) => (v == null ? "" : String(v).trim());

/** Turns sheet_to_json output (any header casing/accents) into typed text rows. Blank lines are skipped. */
export function toImportRows(json: Record<string, unknown>[]): ImportRow[] {
  const rows: ImportRow[] = [];
  json.forEach((raw, i) => {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) r[strip(k)] = cell(v);
    if (!Object.values(r).some(Boolean)) return;
    const times: Partial<Record<Weekday, string>> = {};
    for (const d of WEEKDAY_CODES) {
      const t = r[d.toLowerCase()];
      if (t) times[d] = t;
    }
    rows.push({
      row: i + 2,
      first_name: r["nombre"] ?? "",
      last_name: r["apellidos"] ?? "",
      phone: r["telefono"] ?? "",
      pin: r["pin"] ?? "",
      birth_date: r["fecha_nacimiento"] ?? "",
      join_date: r["fecha_alta"] ?? "",
      plan_days: r["dias_semana"] ?? "",
      times,
      conditions: r["condiciones"] ?? "",
      notes: r["notas"] ?? "",
    });
  });
  return rows;
}

/** AAAA-MM-DD, DD/MM/AAAA (Spain), DD/MM/AA or an Excel serial number. Returns null when blank, undefined when invalid. */
export function parseDate(value: string, now = new Date()): string | null | undefined {
  const v = value.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v)))
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(v))) {
    d = Number(match[1]);
    m = Number(match[2]);
    const yy = Number(match[3]);
    y = match[3]!.length === 4 ? yy : yy <= now.getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  } else if (/^\d{4,6}(\.\d+)?$/.test(v) && Number(v) > 1 && Number(v) < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return undefined;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isRealDate(iso) ? iso : undefined;
}

/** "9:30", "09.30", "9:30 PM" or an Excel day fraction → "HH:MM"; null when it is not a time. */
export function parseTime(value: string): string | null {
  const v = value.trim().toLowerCase();
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/.exec(v))) {
    let h = Number(match[1]);
    const min = Number(match[2]);
    if (match[3] === "pm" && h < 12) h += 12;
    if (match[3] === "am" && h === 12) h = 0;
    return h < 24 && min < 60
      ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
      : null;
  }
  if (/^0?\.\d+$/.test(v)) {
    const total = Math.round(Number(v) * 1440);
    return total < 1440
      ? `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
      : null;
  }
  return null;
}

export interface ImportContext {
  members: (SchedMember & { phone: string })[];
  /** Names of the conditions catalogue. */
  conditions: string[];
  tariffs: Record<string, number>;
  openDays: string[];
  classTimes: string[];
  capacity: number;
  overlapMax: number;
  today: string;
}

export interface NewMemberValues {
  first_name: string;
  last_name: string;
  phone: string;
  pin: string | null;
  birth_date: string | null;
  join_date: string;
  plan_days: number;
  schedule: Partial<Record<Weekday, string>>;
  conditions: string[];
  notes: string;
}
export interface MemberPatch {
  first_name: string;
  last_name?: string;
  pin?: string;
  birth_date?: string | null;
  join_date?: string;
  plan_days?: number;
  schedule?: Partial<Record<Weekday, string>>;
  conditions?: string[];
  notes?: string;
}
export interface ImportPlan {
  inserts: { row: number; values: NewMemberValues }[];
  updates: { row: number; id: string; patch: MemberPatch }[];
  errors: { row: number; phone: string; message: string }[];
}

export function planMemberImport(rows: ImportRow[], ctx: ImportContext): ImportPlan {
  const plan: ImportPlan = { inserts: [], updates: [], errors: [] };
  const byPhone = new Map(ctx.members.map((m) => [m.phone, m]));
  const sim: SchedMember[] = ctx.members.map((m) => ({
    id: m.id,
    active: m.active,
    schedule: { ...m.schedule },
  }));
  const seen = new Map<string, number>();
  const known = new Map(ctx.conditions.map((c) => [strip(c), c]));
  const times = allowedTimes(ctx.classTimes);

  for (const r of rows) {
    const fail = (message: string) => plan.errors.push({ row: r.row, phone: r.phone, message });
    if (!r.first_name.trim()) {
      fail("Falta el nombre");
      continue;
    }
    const phone = normalizePhone(r.phone);
    if (!/^\+?\d{6,15}$/.test(phone)) {
      fail("Teléfono no válido (6-15 dígitos)");
      continue;
    }
    if (seen.has(phone)) {
      fail(`Teléfono repetido en el archivo (fila ${seen.get(phone)})`);
      continue;
    }
    seen.set(phone, r.row);

    let pin: string | undefined;
    if (r.pin.trim()) {
      const p = r.pin.trim();
      if (!loginPin.safeParse(p).success) {
        fail("PIN no válido (4-8 dígitos)");
        continue;
      }
      if (isWeakPin(p)) {
        fail("PIN demasiado fácil de adivinar (0000, 1234, repetidos o secuencias)");
        continue;
      }
      pin = p;
    }

    const birth = parseDate(r.birth_date);
    if (birth === undefined || (birth && (birth > ctx.today || birth < "1900-01-01"))) {
      fail("Fecha de nacimiento no válida (usa AAAA-MM-DD o DD/MM/AAAA)");
      continue;
    }
    const join = parseDate(r.join_date);
    if (join === undefined) {
      fail("Fecha de alta no válida (usa AAAA-MM-DD o DD/MM/AAAA)");
      continue;
    }

    let planDays: number | undefined;
    if (r.plan_days.trim()) {
      planDays = Number(r.plan_days);
      if (!Number.isInteger(planDays) || ctx.tariffs[String(planDays)] === undefined) {
        fail(`No existe tarifa de ${r.plan_days} días`);
        continue;
      }
    }

    const schedule: Partial<Record<Weekday, string>> = {};
    let bad = false;
    for (const d of WEEKDAY_CODES) {
      const raw = r.times[d];
      if (!raw) continue;
      const t = parseTime(raw);
      if (!t || !times.includes(t)) {
        fail(`Hora no válida el ${d}: "${raw}"`);
        bad = true;
        break;
      }
      if (!ctx.openDays.includes(d)) {
        fail(`El centro no abre el ${d}`);
        bad = true;
        break;
      }
      schedule[d] = t;
    }
    if (bad) continue;

    const wanted = r.conditions
      .split(/[;,]/)
      .map((c) => c.trim())
      .filter(Boolean);
    const conditions: string[] = [];
    const unknown: string[] = [];
    for (const c of wanted) {
      const canonical = known.get(strip(c));
      if (!canonical) unknown.push(c);
      else if (!conditions.includes(canonical)) conditions.push(canonical);
    }
    if (unknown.length) {
      fail(`Condición desconocida: ${unknown.join(", ")} (añádela antes en Ajustes)`);
      continue;
    }

    const existing = byPhone.get(phone);
    const placing = Object.keys(schedule).length > 0 && (existing ? existing.active : true);
    if (placing) {
      const others = sim.filter((m) => m.id !== existing?.id);
      let err: string | null = null;
      for (const [d, t] of Object.entries(schedule)) {
        err = validateAssignment(others, existing?.id ?? null, d, t, ctx.capacity, ctx.overlapMax);
        if (err) break;
      }
      if (err) {
        fail(err);
        continue;
      }
    }
    if (Object.keys(schedule).length) {
      if (existing) {
        const m = sim.find((s) => s.id === existing.id);
        if (m) m.schedule = { ...schedule };
      } else sim.push({ id: `new:${r.row}`, active: true, schedule: { ...schedule } });
    }

    if (existing) {
      const patch: MemberPatch = { first_name: r.first_name.trim() };
      if (r.last_name.trim()) patch.last_name = r.last_name.trim();
      if (pin) patch.pin = pin;
      if (birth !== null) patch.birth_date = birth;
      if (join) patch.join_date = join;
      if (planDays !== undefined) patch.plan_days = planDays;
      if (Object.keys(schedule).length) patch.schedule = schedule;
      if (conditions.length) patch.conditions = conditions;
      if (r.notes.trim()) patch.notes = r.notes.trim();
      plan.updates.push({ row: r.row, id: existing.id, patch });
    } else {
      plan.inserts.push({
        row: r.row,
        values: {
          first_name: r.first_name.trim(),
          last_name: r.last_name.trim(),
          phone,
          pin: pin ?? null,
          birth_date: birth,
          join_date: join ?? ctx.today,
          plan_days: planDays ?? 2,
          schedule,
          conditions,
          notes: r.notes.trim(),
        },
      });
    }
  }
  return plan;
}

export interface ExercisePlan {
  rows: { name: string; category: string }[];
  skipped: number;
  errors: { row: number; message: string }[];
}

export function planExerciseImport(
  json: Record<string, unknown>[],
  categories: string[],
  existing: string[],
): ExercisePlan {
  const plan: ExercisePlan = { rows: [], skipped: 0, errors: [] };
  const names = new Set(existing.map((n) => strip(n)));
  const cats = new Map(categories.map((c) => [strip(c), c]));
  json.forEach((raw, i) => {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) r[strip(k)] = cell(v);
    if (!Object.values(r).some(Boolean)) return;
    const name = r["nombre"] ?? "";
    if (!name) return void plan.errors.push({ row: i + 2, message: "Falta el nombre" });
    if (name.length > 120)
      return void plan.errors.push({ row: i + 2, message: "Nombre demasiado largo" });
    const category = cats.get(strip(r["categoria"] || "Fuerza"));
    if (!category)
      return void plan.errors.push({
        row: i + 2,
        message: `Categoría desconocida: ${r["categoria"]}`,
      });
    if (names.has(strip(name))) {
      plan.skipped++;
      return;
    }
    names.add(strip(name));
    plan.rows.push({ name, category });
  });
  return plan;
}
