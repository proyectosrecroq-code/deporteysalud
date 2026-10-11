export const DAYS = ["L", "M", "X", "J", "V", "S", "D"] as const;
export const DAY_NAMES: Record<string, string> = {
  L: "Lunes", M: "Martes", X: "Miércoles", J: "Jueves", V: "Viernes", S: "Sábado", D: "Domingo",
};

export type Sched = Record<string, string>;
export interface SchedMember { id: string; active: boolean; schedule: Sched }

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m || 0);
};
export const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const isOnHour = (t: string) => toMin(t) % 60 === 0;

/** Times a member can be assigned to: the class times plus their on-the-hour (overlapping) variants. */
export function allowedTimes(classTimes: string[]): string[] {
  const set = new Set(classTimes);
  for (const t of classTimes) set.add(t.replace(":30", ":00"));
  return [...set].sort();
}

export function todayCode(d = new Date()) {
  return ["D", "L", "M", "X", "J", "V", "S"][d.getDay()]!;
}

/** Members in a half-hour slot (e.g. 09:30) plus on-the-hour members overlapping it (09:00 and 10:00). */
export function slotMembers<T extends SchedMember>(members: T[], day: string, slot: string) {
  const s = toMin(slot);
  const regular = members.filter((m) => m.active && m.schedule?.[day] === slot);
  const overlap = members.filter((m) => {
    const t = m.active ? m.schedule?.[day] : undefined;
    if (!t || !isOnHour(t)) return false;
    const v = toMin(t);
    return v === s - 30 || v === s + 30;
  });
  return { regular, overlap, count: regular.length + overlap.length };
}

/** Returns an error message if the member can't be placed at that time, otherwise null. */
export function validateAssignment(
  members: SchedMember[], memberId: string | null, day: string, time: string,
  capacity: number, overlapMax: number,
): string | null {
  const others = members.filter((m) => m.id !== memberId && m.active);
  if (isOnHour(time)) {
    const sameHour = others.filter((m) => m.schedule?.[day] === time).length;
    if (sameHour >= overlapMax)
      return `${DAY_NAMES[day]} ${time}: ya hay ${overlapMax} socio solapando en hora en punto`;
    const t = toMin(time);
    for (const adj of [t - 30, t + 30]) {
      const { overlap } = slotMembers(others, day, fromMin(adj));
      if (overlap.length >= overlapMax)
        return `${DAY_NAMES[day]} ${fromMin(adj)}: ya tiene un socio solapando`;
    }
    return null;
  }
  const regular = others.filter((m) => m.schedule?.[day] === time).length;
  if (regular >= capacity) return `${DAY_NAMES[day]} ${time}: aforo completo (${capacity}/${capacity})`;
  return null;
}

const ORDER = ["L", "M", "X", "J", "V", "S", "D"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local calendar date (YYYY-MM-DD). Never use toISOString() for this: it is UTC and flips the day after midnight in Spain. */
export const todayISO = (d = new Date()) => iso(d);

/** Calendar date in the centre's time zone, for server code where the runtime clock is UTC. */
export const madridISO = (d = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(d);

/** A Date at local midnight for the centre's current calendar day (only y/m/d are meaningful). */
export function madridToday(d = new Date()): Date {
  const [y = 2000, m = 1, day = 1] = madridISO(d).split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** Monday of the week containing d, shifted by `offset` weeks. */
export function weekStart(d = new Date(), offset = 0) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7) + offset * 7);
  return m;
}
export function dateOfDay(monday: Date, day: string) {
  const d = new Date(monday); d.setDate(d.getDate() + ORDER.indexOf(day)); return iso(d);
}
/** Date a request applies to: first occurrence of its weekday on/after it was created. */
export function requestDate(createdAt: string, day: string) {
  const c = new Date(createdAt);
  const base = new Date(c.getFullYear(), c.getMonth(), c.getDate());
  const diff = (ORDER.indexOf(day) - ((base.getDay() + 6) % 7) + 7) % 7;
  base.setDate(base.getDate() + diff);
  return iso(base);
}
interface Req { member_id: string; type: string; day: string | null; desired_time: string | null; status: string; created_at: string }
/** Schedules for a concrete week, applying approved absences and time changes. */
export function weekSchedules<T extends SchedMember>(members: T[], requests: Req[], monday: Date): T[] {
  const dates = new Set(ORDER.map((d) => dateOfDay(monday, d)));
  const approved = requests.filter((r) => r.status === "aprobado" && r.day && dates.has(requestDate(r.created_at, r.day)));
  return members.map((m) => {
    const mine = approved.filter((r) => r.member_id === m.id);
    if (!mine.length) return m;
    const schedule = { ...m.schedule };
    for (const r of mine) {
      if (r.type === "ausencia") delete schedule[r.day!];
      else if (r.desired_time) schedule[r.day!] = r.desired_time;
    }
    return { ...m, schedule };
  });
}
