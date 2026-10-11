import { describe, expect, it } from "vitest";
import {
  isWeakPin,
  loginPin,
  memberSchema,
  newPin,
  normalizePhone,
  parseOrThrow,
  phoneStr,
  workoutSchema,
} from "@/lib/validation";
import { allowedTimes, madridISO, madridToday, todayISO } from "@/lib/schedule";

const member = {
  first_name: "Ana",
  last_name: "García",
  phone: "600 111 001",
  pin: "482913",
  join_date: "2026-01-10",
  active: true,
  plan_days: 3,
  schedule: { L: "09:30" },
  conditions: [],
  notes: "",
  consent: false,
};

describe("validación de entrada", () => {
  it("normaliza teléfonos y rechaza los no válidos", () => {
    expect(normalizePhone("+34 600-111.001")).toBe("+34600111001");
    expect(phoneStr.safeParse("600 111 001").data).toBe("600111001");
    expect(phoneStr.safeParse("12").success).toBe(false);
    expect(phoneStr.safeParse("abc123456").success).toBe(false);
  });
  it("PIN: el login acepta los antiguos de 4 dígitos, pero no se pueden crear débiles", () => {
    expect(loginPin.safeParse("1234").success).toBe(true);
    expect(newPin.safeParse("1234").success).toBe(false);
    for (const weak of ["0000", "1111", "123456", "654321", "2580"])
      expect(isWeakPin(weak)).toBe(true);
    expect(isWeakPin("482913")).toBe(false);
    expect(loginPin.safeParse("12ab").success).toBe(false);
  });
  it("la ficha del socio descarta columnas desconocidas y valida los tipos", () => {
    const parsed = memberSchema.parse({ ...member, is_admin: true, id: undefined });
    expect(parsed).not.toHaveProperty("is_admin");
    expect(parsed.phone).toBe("600111001");
    expect(() => parseOrThrow(memberSchema, { ...member, plan_days: 0 })).toThrow(
      /no válidos \(plan_days\)/,
    );
    expect(() => parseOrThrow(memberSchema, { ...member, schedule: { L: "9h" } })).toThrow(
      /Hora no válida/,
    );
    expect(() => parseOrThrow(memberSchema, { ...member, schedule: { Z: "09:30" } })).toThrow();
    expect(() => parseOrThrow(memberSchema, { ...member, birth_date: "2000-02-31" })).toThrow(
      /Fecha no válida/,
    );
  });
  it("los pesos registrados solo admiten números", () => {
    const w = {
      member_id: "11111111-1111-4111-8111-111111111111",
      date: "2026-10-10",
      type: "Completo",
      title: "x",
      blocks: [{ block: "Fuerza", items: [{ name: "Sentadilla", recordedLoad: "35,5" }] }],
    };
    expect(workoutSchema.safeParse(w).success).toBe(true);
    w.blocks[0]!.items[0]!.recordedLoad = "<script>";
    expect(workoutSchema.safeParse(w).success).toBe(false);
  });
});

describe("fechas y horas del centro", () => {
  it("el día de España cambia a medianoche local, no a medianoche UTC", () => {
    // 22:30 UTC del 10 de octubre ya es 00:30 del día 11 en España (horario de verano).
    expect(madridISO(new Date("2026-10-10T22:30:00Z"))).toBe("2026-10-11");
    expect(madridISO(new Date("2026-10-10T21:30:00Z"))).toBe("2026-10-10");
    expect(madridISO(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
    const d = madridToday(new Date("2026-10-10T22:30:00Z"));
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 11]);
  });
  it("todayISO usa la fecha local", () => {
    expect(todayISO(new Date(2026, 9, 11, 0, 5))).toBe("2026-10-11");
  });
  it("las horas permitidas incluyen las medias y sus horas en punto", () => {
    expect(allowedTimes(["09:30", "10:30"])).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });
});
