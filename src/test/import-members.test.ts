import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseDate,
  parseTime,
  planExerciseImport,
  planMemberImport,
  toImportRows,
  type ImportContext,
} from "@/lib/import-members";

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  members: [],
  conditions: ["Lumbalgia", "Pérdida de peso", "Preparar Hyrox"],
  tariffs: { "2": 90, "3": 120, "4": 150 },
  openDays: ["L", "M", "X", "J", "V"],
  classTimes: ["09:30", "10:30", "18:30"],
  capacity: 6,
  overlapMax: 1,
  today: "2026-10-11",
  ...over,
});
const rowOf = (over: Record<string, unknown>) =>
  toImportRows([{ nombre: "Ana", telefono: "600111001", ...over }]);

describe("fechas del Excel", () => {
  it("acepta ISO, dd/mm/aaaa, dd/mm/aa y números de serie de Excel", () => {
    expect(parseDate("1960-03-12")).toBe("1960-03-12");
    expect(parseDate("12/03/1960")).toBe("1960-03-12");
    expect(parseDate("12-3-1960")).toBe("1960-03-12");
    expect(parseDate("12/03/60", new Date(2026, 9, 11))).toBe("1960-03-12");
    expect(parseDate("12/03/05", new Date(2026, 9, 11))).toBe("2005-03-12");
    expect(parseDate("21987")).toBe("1960-03-12");
    expect(parseDate("")).toBeNull();
  });
  it("rechaza fechas imposibles en vez de inventarlas", () => {
    expect(parseDate("31/02/2000")).toBeUndefined();
    expect(parseDate("2000-13-01")).toBeUndefined();
    expect(parseDate("ayer")).toBeUndefined();
  });
  it("un archivo real de Excel con fechas y horas llega bien en cualquier zona horaria", () => {
    const serial = (Date.UTC(1960, 2, 12) - Date.UTC(1899, 11, 30)) / 864e5;
    const time = 0.3958333333333333;
    const ws: XLSX.WorkSheet = {
      A1: { t: "s", v: "nombre" },
      B1: { t: "s", v: "telefono" },
      C1: { t: "s", v: "fecha_nacimiento" },
      D1: { t: "s", v: "L" },
      A2: { t: "s", v: "Ana" },
      B2: { t: "n", v: 600111001 },
      C2: { t: "n", v: serial, z: "m/d/yy" },
      D2: { t: "n", v: time, z: "h:mm" },
      A3: { t: "s", v: "Bo" },
      B3: { t: "s", v: "600 111 002" },
      C3: { t: "n", v: serial, z: "dd/mm/yyyy" },
      D3: { t: "n", v: time, z: "h:mm AM/PM" },
      A4: { t: "s", v: "Cy" },
      B4: { t: "s", v: "600111003" },
      C4: { t: "n", v: serial },
      D4: { t: "n", v: time },
      "!ref": "A1:D4",
    };
    const buf = XLSX.write(
      { SheetNames: ["S"], Sheets: { S: ws } },
      { type: "buffer", bookType: "xlsx" },
    );
    const wb = XLSX.read(buf, { dateNF: "yyyy-mm-dd" });
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["S"]!, {
      raw: false,
      defval: "",
      dateNF: "yyyy-mm-dd",
    });
    const plan = planMemberImport(toImportRows(json), ctx());
    expect(plan.errors).toEqual([]);
    expect(plan.inserts.map((i) => i.values.birth_date)).toEqual([
      "1960-03-12",
      "1960-03-12",
      "1960-03-12",
    ]);
    expect(plan.inserts.map((i) => i.values.schedule)).toEqual([
      { L: "09:30" },
      { L: "09:30" },
      { L: "09:30" },
    ]);
  });
});

describe("horas", () => {
  it("normaliza formatos habituales", () => {
    expect(parseTime("9:30")).toBe("09:30");
    expect(parseTime("09.30")).toBe("09:30");
    expect(parseTime("6:30 PM")).toBe("18:30");
    expect(parseTime("12:00 AM")).toBe("00:00");
    expect(parseTime("0.395833333")).toBe("09:30");
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("mañana")).toBeNull();
  });
});

describe("plan de importación de socios", () => {
  it("crea socios nuevos sin PIN (lo genera el servidor) y sin consentimiento implícito", () => {
    const plan = planMemberImport(
      rowOf({
        apellidos: "García",
        dias_semana: 3,
        L: "9:30",
        condiciones: "lumbalgia; Pérdida de peso",
      }),
      ctx(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]!.values).toMatchObject({
      phone: "600111001",
      pin: null,
      plan_days: 3,
      schedule: { L: "09:30" },
      conditions: ["Lumbalgia", "Pérdida de peso"],
    });
    expect(plan.inserts[0]!.values).not.toHaveProperty("consent");
  });
  it("no toca el PIN, el estado ni los datos que el Excel deja vacíos en socios existentes", () => {
    const members = [{ id: "m1", phone: "600111001", active: true, schedule: { L: "09:30" } }];
    const plan = planMemberImport(rowOf({ apellidos: "", notas: "" }), ctx({ members }));
    expect(plan.updates).toEqual([{ row: 2, id: "m1", patch: { first_name: "Ana" } }]);
  });
  it("PIN indicado en el Excel: válido o error, nunca uno débil", () => {
    expect(planMemberImport(rowOf({ pin: "482913" }), ctx()).inserts[0]!.values.pin).toBe("482913");
    expect(planMemberImport(rowOf({ pin: "1234" }), ctx()).errors[0]!.message).toMatch(
      /fácil de adivinar/,
    );
    expect(planMemberImport(rowOf({ pin: "12" }), ctx()).errors[0]!.message).toMatch(
      /PIN no válido/,
    );
  });
  it("cada fila mala se descarta con su motivo y las demás siguen", () => {
    const rows = toImportRows([
      { nombre: "Ok", telefono: "600000001" },
      { nombre: "", telefono: "600000002" },
      { nombre: "Tel", telefono: "12" },
      { nombre: "Fecha", telefono: "600000003", fecha_nacimiento: "31/02/2000" },
      { nombre: "Tarifa", telefono: "600000004", dias_semana: 9 },
      { nombre: "Hora", telefono: "600000005", L: "03:00" },
      { nombre: "Cond", telefono: "600000006", condiciones: "Inventada" },
      { nombre: "Dup", telefono: "600 000 001" },
    ]);
    const plan = planMemberImport(rows, ctx());
    expect(plan.inserts.map((i) => i.row)).toEqual([2]);
    expect(plan.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(plan.errors[6]!.message).toMatch(/repetido/);
  });
  it("respeta el aforo: el 7º socio de la misma hora se rechaza", () => {
    const members = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      phone: `70000000${i}`,
      active: true,
      schedule: { L: "09:30" },
    }));
    const plan = planMemberImport(rowOf({ L: "9:30" }), ctx({ members }));
    expect(plan.inserts).toHaveLength(0);
    expect(plan.errors[0]!.message).toMatch(/aforo completo/);
  });
  it("cuenta a los socios del propio archivo para el aforo", () => {
    const rows = toImportRows(
      Array.from({ length: 8 }, (_, i) => ({
        nombre: `S${i}`,
        telefono: `60000010${i}`,
        L: "10:30",
      })),
    );
    const plan = planMemberImport(rows, ctx());
    expect(plan.inserts).toHaveLength(6);
    expect(plan.errors).toHaveLength(2);
  });
  it("las cabeceras valen con mayúsculas, tildes y espacios", () => {
    const rows = toImportRows([
      {
        " Nombre ": "Ana",
        Teléfono: "600111001",
        Fecha_Nacimiento: "1990-03-12",
        Condiciones: "Lumbalgia",
      },
    ]);
    expect(rows[0]).toMatchObject({
      first_name: "Ana",
      phone: "600111001",
      birth_date: "1990-03-12",
    });
  });
});

describe("importación de ejercicios", () => {
  it("omite duplicados (también dentro del archivo) y valida la categoría", () => {
    const plan = planExerciseImport(
      [
        { nombre: "Remo", categoria: "Fuerza" },
        { nombre: "remo", categoria: "fuerza" },
        { nombre: "Peso muerto", categoria: "" },
        { nombre: "Nuevo", categoria: "Magia" },
        { nombre: "Existente", categoria: "Core" },
      ],
      ["Fuerza", "Core"],
      ["Existente"],
    );
    expect(plan.rows).toEqual([
      { name: "Remo", category: "Fuerza" },
      { name: "Peso muerto", category: "Fuerza" },
    ]);
    expect(plan.skipped).toBe(2);
    expect(plan.errors).toHaveLength(1);
  });
});
