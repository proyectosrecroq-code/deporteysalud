import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Upload, Save, Trash2, X } from "lucide-react";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useAppData, useMutate, getToken, saveSession, handleAuthError, KIND_LABEL, type Settings } from "@/lib/store";
import { ownerChangePassword, ownerImportMembers, ownerRestore, ownerSaveSettings } from "@/lib/api.functions";
import { isAuthError } from "@/lib/auth-errors";
import {
  MAX_IMPORT_ROWS,
  parseTime,
  planExerciseImport,
  planMemberImport,
  toImportRows,
  type ExercisePlan,
  type ImportPlan,
  type ImportRow,
} from "@/lib/import-members";
import { DAYS, DAY_NAMES, todayISO } from "@/lib/schedule";
import { PASSWORD_MIN } from "@/lib/validation";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/app/ajustes")({
  head: () => pageHead("Ajustes", "Tarifas, horarios, ejercicios e importaciones del centro."),
  component: Ajustes,
});

const MEMBER_COLS = ["nombre", "apellidos", "telefono", "pin", "fecha_nacimiento", "fecha_alta", "dias_semana", "L", "M", "X", "J", "V", "condiciones", "notas"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Preview =
  | { kind: "members"; rows: ImportRow[]; plan: ImportPlan }
  | { kind: "exercises"; plan: ExercisePlan };
interface ImportResult {
  inserted: number;
  updated: number;
  errors: { row: number; phone: string; message: string }[];
  generated: { name: string; phone: string; pin: string }[];
}

/** Spreadsheets run text starting with = + - @ as formulas: neutralise it in exported CSV. */
const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Ajustes() {
  const { data, settings } = useAppData();
  const mut = useMutate();
  const qc = useQueryClient();
  const restore = useServerFn(ownerRestore);
  const saveSettingsFn = useServerFn(ownerSaveSettings);
  const changePassword = useServerFn(ownerChangePassword);
  const importMembers = useServerFn(ownerImportMembers);
  const [s, setS] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [newCond, setNewCond] = useState({ kind: "lesion", name: "" });
  const [pendingBackup, setPendingBackup] = useState<Record<string, unknown> | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  useEffect(() => {
    if (settings && !s) setS(structuredClone(settings));
  }, [settings, s]);
  if (!data || !s) return null;

  const fail = (e: unknown) => (isAuthError(e) ? handleAuthError() : toast.error((e as Error).message));

  const saveSettings = async () => {
    try {
      await saveSettingsFn({ data: { token: getToken(), settings: s } });
      await qc.invalidateQueries({ queryKey: ["app"] });
      toast.success("Ajustes guardados");
    } catch (e) {
      fail(e);
    }
  };

  const submitPassword = async () => {
    if (pw.next.length < PASSWORD_MIN) return void toast.error(`La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
    if (pw.next !== pw.confirm) return void toast.error("Las contraseñas nuevas no coinciden");
    try {
      saveSession(await changePassword({ data: { token: getToken(), current: pw.current, next: pw.next } }));
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Contraseña cambiada");
    } catch (e) {
      fail(e);
    }
  };

  const template = (kind: "members" | "exercises") => {
    const wb = XLSX.utils.book_new();
    const rows =
      kind === "members"
        ? [MEMBER_COLS, ["Laura", "García López", "600000000", "", "1990-03-12", "2026-01-10", 3, "09:30", "", "09:30", "", "09:30", "Lumbalgia; Pérdida de peso", ""]]
        : [["nombre", "categoria"], ["Sentadilla trasera", "Fuerza"], ["Remo ergómetro", "Calentamiento"]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), kind === "members" ? "Socios" : "Ejercicios");
    XLSX.writeFile(wb, kind === "members" ? "plantilla_socios.xlsx" : "plantilla_ejercicios.xlsx");
  };

  const readExcel = async (kind: "members" | "exercises", file: File) => {
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("El archivo es demasiado grande (máximo 10 MB)");
      // dateNF makes real Excel dates arrive as AAAA-MM-DD instead of a locale-dependent m/d/yy.
      const wb = XLSX.read(await file.arrayBuffer(), { dateNF: "yyyy-mm-dd" });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("El archivo no tiene hojas");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "", dateNF: "yyyy-mm-dd" });
      if (kind === "members") {
        const rows = toImportRows(json);
        if (!rows.length) throw new Error("No hay filas para importar");
        if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Máximo ${MAX_IMPORT_ROWS} filas por importación`);
        const plan = planMemberImport(rows, {
          members: data.members,
          conditions: data.conditions.map((c) => c.name),
          tariffs: s.tariffs,
          openDays: s.open_days,
          classTimes: s.class_times,
          capacity: s.capacity,
          overlapMax: s.overlap_max,
          today: todayISO(),
        });
        setPreview({ kind, rows, plan });
      } else {
        const plan = planExerciseImport(json, s.exercise_categories, data.exercises.map((x) => x.name));
        setPreview({ kind, plan });
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      if (preview.kind === "members") {
        const out = await importMembers({ data: { token: getToken(), rows: preview.rows } });
        setResult(out);
        toast.success(`${out.inserted} socios nuevos, ${out.updated} actualizados${out.errors.length ? `, ${out.errors.length} con errores` : ""}`);
      } else {
        await mut.mutateAsync({ table: "exercises", action: "insertMany", rows: preview.plan.rows });
        toast.success(`${preview.plan.rows.length} ejercicios importados`);
      }
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["app"] });
    } catch (e) {
      fail(e);
    } finally {
      setImporting(false);
    }
  };

  const backup = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), ...data };
    download(`copia_centro_${todayISO()}.json`, JSON.stringify(payload, null, 1), "application/json");
  };

  const readBackup = async (file: File) => {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("La copia es demasiado grande");
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("No es una copia de seguridad válida");
      setPendingBackup(parsed as Record<string, unknown>);
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "El archivo no es un JSON válido" : (e as Error).message);
    }
  };

  const downloadPins = (rows: ImportResult["generated"]) =>
    download("pines_nuevos.csv", ["nombre,telefono,pin", ...rows.map((r) => [r.name, r.phone, r.pin].map(csvCell).join(","))].join("\n"), "text/csv");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black uppercase">Ajustes</h1>
        <button onClick={() => void saveSettings()} className="glow flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
          <Save className="h-4 w-4" />
          Guardar ajustes
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card t="Importar desde Excel">
          {(["members", "exercises"] as const).map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-2 py-1">
              <span className="flex-1 text-sm">{k === "members" ? "Socios" : "Ejercicios"}</span>
              <button onClick={() => template(k)} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <Download className="h-3 w-3" />
                Plantilla
              </button>
              <label className="flex cursor-pointer items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
                <Upload className="h-3 w-3" />
                Importar
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readExcel(k, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ))}
        </Card>
        <Card t="Tarifas y aforo">
          {Object.entries(s.tariffs).map(([d, p]) => (
            <div key={d} className="flex items-center gap-2 py-1 text-sm">
              <span className="flex-1">{d} días/semana</span>
              <input type="number" min={0} className="field w-24" value={p} onChange={(e) => setS({ ...s, tariffs: { ...s.tariffs, [d]: Number(e.target.value) } })} />€
            </div>
          ))}
          <div className="flex items-center gap-2 py-1 text-sm">
            <span className="flex-1">Aforo por clase</span>
            <input type="number" min={1} className="field w-24" value={s.capacity} onChange={(e) => setS({ ...s, capacity: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2 py-1 text-sm">
            <span className="flex-1">Máx. solapados (hora en punto)</span>
            <input type="number" min={0} className="field w-24" value={s.overlap_max} onChange={(e) => setS({ ...s, overlap_max: Number(e.target.value) })} />
          </div>
        </Card>
        <Card t="Días de apertura">
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d) => (
              <button
                key={d}
                onClick={() => setS({ ...s, open_days: s.open_days.includes(d) ? s.open_days.filter((x) => x !== d) : DAYS.filter((x) => s.open_days.includes(x) || x === d) })}
                className={`rounded-full border px-3 py-1 text-sm ${s.open_days.includes(d) ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}
              >
                {DAY_NAMES[d]}
              </button>
            ))}
          </div>
        </Card>
        <ListEditor label="Horas de clase" k="class_times" placeholder="ej. 12:30" s={s} setS={setS} />
        <ListEditor label="Métodos de pago" k="payment_methods" placeholder="ej. DOMICILIACIÓN" s={s} setS={setS} />
        <ListEditor label="Categorías de ejercicio" k="exercise_categories" placeholder="ej. Pliometría" s={s} setS={setS} />
        <Card t="Lesiones, patologías, condiciones y objetivos">
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {data.conditions.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span>
                  {c.name} <span className="text-xs text-muted-foreground">· {KIND_LABEL[c.kind]}</span>
                </span>
                <button aria-label={`Quitar ${c.name}`} onClick={() => mut.mutate({ table: "conditions", action: "delete", id: c.id })}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <select className="field w-32" value={newCond.kind} onChange={(e) => setNewCond({ ...newCond, kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input className="field" aria-label="Nueva condición" value={newCond.name} onChange={(e) => setNewCond({ ...newCond, name: e.target.value })} />
            <button
              className="rounded-lg border px-3 text-sm"
              onClick={() => newCond.name.trim() && mut.mutate({ table: "conditions", action: "insertMany", rows: [{ ...newCond, name: newCond.name.trim() }] }, { onSuccess: () => setNewCond({ ...newCond, name: "" }) })}
            >
              Añadir
            </button>
          </div>
        </Card>
        <Card t="Contraseña de acceso">
          <p className="mb-2 text-xs text-muted-foreground">Mínimo {PASSWORD_MIN} caracteres. Al cambiarla se cierran las demás sesiones abiertas.</p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
          >
            <input type="password" className="field" placeholder="Contraseña actual" aria-label="Contraseña actual" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <input type="password" className="field" placeholder="Nueva contraseña" aria-label="Nueva contraseña" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <input type="password" className="field" placeholder="Repite la nueva contraseña" aria-label="Repite la nueva contraseña" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            <button type="submit" disabled={!pw.current || !pw.next} className="w-full rounded-lg border py-2 text-sm disabled:opacity-50">
              Cambiar contraseña
            </button>
          </form>
        </Card>
        <Card t="Copias de seguridad">
          <button onClick={backup} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground">
            <Download className="h-4 w-4" />
            Guardar copia de seguridad
          </button>
          <p className="mb-2 text-xs text-muted-foreground">La copia contiene datos de salud y PIN de socios: guárdala en un lugar seguro.</p>
          <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-sm">
            <Upload className="h-4 w-4" />
            Importar copia de seguridad
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readBackup(f);
                e.target.value = "";
              }}
            />
          </label>
          {pendingBackup && (
            <ConfirmDelete
              title="Restaurar copia"
              description={`Se reemplazarán TODOS los datos actuales por la copia (${Array.isArray(pendingBackup["members"]) ? pendingBackup["members"].length : 0} socios). Si algo falla, se recuperan los datos actuales.`}
              onConfirm={async () => {
                try {
                  await restore({ data: { token: getToken(), backup: pendingBackup } });
                  toast.success("Copia restaurada");
                  setPendingBackup(null);
                  setS(null);
                  await qc.invalidateQueries();
                } catch (err) {
                  fail(err);
                }
              }}
              trigger={<button className="mt-2 w-full rounded-lg border border-warning py-2 text-sm text-warning">Confirmar restauración</button>}
            />
          )}
        </Card>
        <Card t="Zona peligrosa">
          <ConfirmDelete
            title="Eliminar base de datos de socios"
            description="Se borrarán todos los socios, pagos, entrenos y avisos. No se puede deshacer."
            onConfirm={() => mut.mutate({ table: "members", action: "deleteAll" }, { onSuccess: () => toast.success("Socios eliminados") })}
            trigger={<button className="mb-2 w-full rounded-lg border border-destructive py-2 text-sm text-destructive">Eliminar base de datos de socios</button>}
          />
          <ConfirmDelete
            title="Eliminar base de datos de ejercicios"
            description="Se borrarán todos los ejercicios del catálogo."
            onConfirm={() => mut.mutate({ table: "exercises", action: "deleteAll" }, { onSuccess: () => toast.success("Ejercicios eliminados") })}
            trigger={<button className="w-full rounded-lg border border-destructive py-2 text-sm text-destructive">Eliminar base de datos de ejercicios</button>}
          />
        </Card>
      </div>

      {preview && (
        <Overlay>
          {preview.kind === "members" ? <MemberPreview preview={preview} /> : <ExercisePreview plan={preview.plan} />}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setPreview(null)} className="rounded-lg border px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              onClick={() => void confirmImport()}
              disabled={importing || !(preview.kind === "members" ? preview.plan.inserts.length + preview.plan.updates.length : preview.plan.rows.length)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {importing ? "Importando…" : "Guardar importación"}
            </button>
          </div>
        </Overlay>
      )}

      {result && (
        <Overlay>
          <h2 className="mb-2 text-2xl font-bold uppercase">Importación terminada</h2>
          <p className="text-sm">
            {result.inserted} socios nuevos · {result.updated} actualizados · {result.errors.length} con errores
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-warning">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {result.generated.length > 0 && (
            <div className="mt-3 rounded-lg border border-primary/40 p-3 text-sm">
              <p>Se han generado {result.generated.length} PIN para los socios nuevos. Descárgalos ahora para dárselos a cada socio (también los verás en su ficha).</p>
              <button onClick={() => downloadPins(result.generated)} className="mt-2 flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                <Download className="h-3 w-3" />
                Descargar PIN (CSV)
              </button>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button onClick={() => setResult(null)} className="rounded-lg border px-4 py-2 text-sm">
              Cerrar
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function ListEditor({ label, k, placeholder, s, setS }: { label: string; k: "class_times" | "payment_methods" | "exercise_categories"; placeholder: string; s: Settings; setS: (s: Settings) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    let value = v.trim();
    if (k === "class_times") {
      const t = parseTime(value);
      if (!t) return void toast.error("Hora no válida (usa HH:MM)");
      value = t;
    }
    if (value && !s[k].includes(value)) setS({ ...s, [k]: [...s[k], value].sort() });
    setV("");
  };
  return (
    <Card t={label}>
      <div className="flex flex-wrap gap-1">
        {s[k].map((x) => (
          <span key={x} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-sm">
            {x}
            <button aria-label={`Quitar ${x}`} onClick={() => setS({ ...s, [k]: s[k].filter((y) => y !== x) })}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="field" placeholder={placeholder} aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="rounded-lg border px-3 text-sm" onClick={add}>
          Añadir
        </button>
      </div>
    </Card>
  );
}

function MemberPreview({ preview }: { preview: Extract<Preview, { kind: "members" }> }) {
  const { inserts, updates, errors } = preview.plan;
  const shown = [...inserts.map((i) => ({ kind: "Nuevo", row: i.row, v: i.values })), ...updates.map((u) => ({ kind: "Actualiza", row: u.row, v: u.patch }))].sort((a, b) => a.row - b.row);
  return (
    <>
      <h2 className="mb-2 text-2xl font-bold uppercase">Vista previa · {preview.rows.length} filas</h2>
      <p className="text-sm">
        <b className="text-success">{inserts.length}</b> nuevos · <b className="text-primary">{updates.length}</b> actualizaciones · <b className="text-warning">{errors.length}</b> con errores (no se importarán)
      </p>
      <p className="my-2 rounded-lg border border-warning/40 p-2 text-xs text-warning">
        Los socios importados quedan <b>sin consentimiento</b> de datos de salud. Marca el consentimiento en cada ficha cuando el socio lo firme. Los PIN vacíos se generan automáticamente; los socios existentes conservan su PIN.
      </p>
      {errors.length > 0 && (
        <ul className="mb-2 max-h-32 overflow-auto text-xs text-warning">
          {errors.map((e, i) => (
            <li key={i}>
              Fila {e.row}
              {e.phone ? ` (${e.phone})` : ""}: {e.message}
            </li>
          ))}
        </ul>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr>
            {["Fila", "", "Nombre", "Apellidos", "Teléfono", "Días", "Horario"].map((h) => (
              <th key={h} className="p-1 text-left text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, 50).map(({ kind, row, v }) => (
            <tr key={row} className="border-t">
              <td className="p-1">{row}</td>
              <td className="p-1">{kind}</td>
              <td className="p-1">{v.first_name}</td>
              <td className="p-1">{v.last_name ?? "—"}</td>
              <td className="p-1">{"phone" in v ? v.phone : "—"}</td>
              <td className="p-1">{v.plan_days ?? "—"}</td>
              <td className="p-1">{v.schedule ? Object.entries(v.schedule).map(([d, t]) => `${d} ${t}`).join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > 50 && <p className="mt-1 text-xs text-muted-foreground">Se muestran las primeras 50 de {shown.length}.</p>}
    </>
  );
}

function ExercisePreview({ plan }: { plan: ExercisePlan }) {
  return (
    <>
      <h2 className="mb-2 text-2xl font-bold uppercase">Vista previa · ejercicios</h2>
      <p className="text-sm">
        <b className="text-success">{plan.rows.length}</b> nuevos · {plan.skipped} ya existían · <b className="text-warning">{plan.errors.length}</b> con errores
      </p>
      {plan.errors.length > 0 && (
        <ul className="my-2 max-h-32 overflow-auto text-xs text-warning">
          {plan.errors.map((e, i) => (
            <li key={i}>
              Fila {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}
      <table className="w-full text-xs">
        <tbody>
          {plan.rows.slice(0, 50).map((r) => (
            <tr key={r.name} className="border-t">
              <td className="p-1">{r.name}</td>
              <td className="p-1 text-muted-foreground">{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="panel max-h-[85vh] w-full max-w-4xl overflow-auto">{children}</div>
    </div>
  );
}

function Card({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-bold uppercase">{t}</h2>
      {children}
    </div>
  );
}
