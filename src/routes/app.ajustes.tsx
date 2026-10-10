import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Upload, Save, Trash2, X } from "lucide-react";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useAppData, useMutate, getPw, KIND_LABEL, type Settings } from "@/lib/store";
import { ownerRestore } from "@/lib/api.functions";
import { DAYS, DAY_NAMES } from "@/lib/schedule";

export const Route = createFileRoute("/app/ajustes")({ component: Ajustes });

const MEMBER_COLS = ["nombre", "apellidos", "telefono", "pin", "fecha_nacimiento", "fecha_alta", "dias_semana", "L", "M", "X", "J", "V", "condiciones", "notas"];

function Ajustes() {
  const { data, settings } = useAppData();
  const mut = useMutate();
  const qc = useQueryClient();
  const restore = useServerFn(ownerRestore);
  const [s, setS] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<{ kind: "members" | "exercises"; rows: any[] } | null>(null);
  const [newCond, setNewCond] = useState({ kind: "lesion", name: "" });
  const [pendingBackup, setPendingBackup] = useState<any>(null);
  useEffect(() => { if (settings && !s) setS(structuredClone(settings)); }, [settings, s]);
  if (!data || !s) return null;

  const saveSettings = () => mut.mutate({ table: "settings", action: "upsert", rows: [{ id: 1, data: s }] }, { onSuccess: () => toast.success("Ajustes guardados") });

  const template = (kind: "members" | "exercises") => {
    const wb = XLSX.utils.book_new();
    const rows = kind === "members"
      ? [MEMBER_COLS, ["Laura", "García López", "600000000", "1234", "1990-03-12", "2026-01-10", 3, "09:30", "", "09:30", "", "09:30", "Lumbalgia; Pérdida de peso", ""]]
      : [["nombre", "categoria"], ["Sentadilla trasera", "Fuerza"], ["Remo ergómetro", "Calentamiento"]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), kind === "members" ? "Socios" : "Ejercicios");
    XLSX.writeFile(wb, kind === "members" ? "plantilla_socios.xlsx" : "plantilla_ejercicios.xlsx");
  };
  const readExcel = async (kind: "members" | "exercises", file: File) => {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false, raw: false });
    const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
    const rows = kind === "members"
      ? json.filter((r) => r.nombre && r.telefono).map((r) => ({
          first_name: String(r.nombre).trim(), last_name: String(r.apellidos ?? "").trim(), phone: String(r.telefono).trim(),
          pin: String(r.pin || Math.floor(1000 + Math.random() * 9000)), birth_date: r.fecha_nacimiento || null,
          join_date: r.fecha_alta || new Date().toISOString().slice(0, 10), plan_days: Number(r.dias_semana) || 2,
          schedule: Object.fromEntries(["L", "M", "X", "J", "V"].filter((d) => r[d]).map((d) => [d, String(r[d]).trim()])),
          conditions: String(r.condiciones ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean), notes: String(r.notas ?? ""),
        }))
      : json.filter((r) => r.nombre).map((r) => ({ name: String(r.nombre).trim(), category: String(r.categoria || "Fuerza").trim() }));
    setPreview({ kind, rows });
  };
  const confirmImport = () => {
    if (!preview) return;
    mut.mutate(
      preview.kind === "members" ? { table: "members", action: "upsert", rows: preview.rows, onConflict: "phone" } : { table: "exercises", action: "insertMany", rows: preview.rows },
      { onSuccess: () => { toast.success(`${preview.rows.length} registros importados`); setPreview(null); } },
    );
  };
  const backup = () => {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `copia_centro_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  const ListEditor = ({ label, k, placeholder }: { label: string; k: "class_times" | "payment_methods" | "exercise_categories"; placeholder: string }) => {
    const [v, setV] = useState("");
    return (
      <Card t={label}>
        <div className="flex flex-wrap gap-1">{s[k].map((x) => <span key={x} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-sm">{x}<button onClick={() => setS({ ...s, [k]: s[k].filter((y) => y !== x) })}><X className="h-3 w-3" /></button></span>)}</div>
        <div className="mt-2 flex gap-2"><input className="field" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
          <button className="rounded-lg border px-3 text-sm" onClick={() => { if (v.trim() && !s[k].includes(v.trim())) setS({ ...s, [k]: [...s[k], v.trim()].sort() }); setV(""); }}>Añadir</button></div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black uppercase">Ajustes</h1>
        <button onClick={saveSettings} className="glow flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"><Save className="h-4 w-4" />Guardar ajustes</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card t="Importar desde Excel">
          {(["members", "exercises"] as const).map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-2 py-1">
              <span className="flex-1 text-sm">{k === "members" ? "Socios" : "Ejercicios"}</span>
              <button onClick={() => template(k)} className="flex items-center gap-1 rounded border px-2 py-1 text-xs"><Download className="h-3 w-3" />Plantilla</button>
              <label className="flex cursor-pointer items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"><Upload className="h-3 w-3" />Importar
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && readExcel(k, e.target.files[0])} /></label>
            </div>
          ))}
        </Card>
        <Card t="Tarifas y aforo">
          {Object.entries(s.tariffs).map(([d, p]) => (
            <div key={d} className="flex items-center gap-2 py-1 text-sm"><span className="flex-1">{d} días/semana</span>
              <input type="number" className="field w-24" value={p} onChange={(e) => setS({ ...s, tariffs: { ...s.tariffs, [d]: Number(e.target.value) } })} />€</div>
          ))}
          <div className="flex items-center gap-2 py-1 text-sm"><span className="flex-1">Aforo por clase</span><input type="number" className="field w-24" value={s.capacity} onChange={(e) => setS({ ...s, capacity: Number(e.target.value) })} /></div>
          <div className="flex items-center gap-2 py-1 text-sm"><span className="flex-1">Máx. solapados (hora en punto)</span><input type="number" className="field w-24" value={s.overlap_max} onChange={(e) => setS({ ...s, overlap_max: Number(e.target.value) })} /></div>
        </Card>
        <Card t="Días de apertura">
          <div className="flex flex-wrap gap-1">{DAYS.map((d) => (
            <button key={d} onClick={() => setS({ ...s, open_days: s.open_days.includes(d) ? s.open_days.filter((x) => x !== d) : DAYS.filter((x) => s.open_days.includes(x) || x === d) })}
              className={`rounded-full border px-3 py-1 text-sm ${s.open_days.includes(d) ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{DAY_NAMES[d]}</button>
          ))}</div>
        </Card>
        <ListEditor label="Horas de clase" k="class_times" placeholder="ej. 12:30" />
        <ListEditor label="Métodos de pago" k="payment_methods" placeholder="ej. DOMICILIACIÓN" />
        <ListEditor label="Categorías de ejercicio" k="exercise_categories" placeholder="ej. Pliometría" />
        <Card t="Lesiones, patologías, condiciones y objetivos">
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {data.conditions.map((c) => <div key={c.id} className="flex items-center justify-between text-sm"><span>{c.name} <span className="text-xs text-muted-foreground">· {KIND_LABEL[c.kind]}</span></span>
              <button onClick={() => mut.mutate({ table: "conditions", action: "delete", id: c.id })}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button></div>)}
          </div>
          <div className="mt-2 flex gap-2">
            <select className="field w-32" value={newCond.kind} onChange={(e) => setNewCond({ ...newCond, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input className="field" value={newCond.name} onChange={(e) => setNewCond({ ...newCond, name: e.target.value })} />
            <button className="rounded-lg border px-3 text-sm" onClick={() => newCond.name.trim() && mut.mutate({ table: "conditions", action: "insertMany", rows: [{ ...newCond, name: newCond.name.trim() }] }, { onSuccess: () => setNewCond({ ...newCond, name: "" }) })}>Añadir</button>
          </div>
        </Card>
        <Card t="Contraseña de acceso">
          <p className="mb-2 text-xs text-muted-foreground">Vacía = acceso libre. Se aplica al guardar ajustes.</p>
          <input type="password" className="field" placeholder="Nueva contraseña" value={s.owner_password} onChange={(e) => setS({ ...s, owner_password: e.target.value })} />
        </Card>
        <Card t="Copias de seguridad">
          <button onClick={backup} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"><Download className="h-4 w-4" />Guardar copia de seguridad</button>
          <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-sm"><Upload className="h-4 w-4" />Importar copia de seguridad
            <input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPendingBackup(JSON.parse(await f.text())); }} /></label>
          {pendingBackup && (
            <ConfirmDelete title="Restaurar copia" description={`Se reemplazarán TODOS los datos actuales por la copia (${pendingBackup.members?.length ?? 0} socios).`}
              onConfirm={async () => { try { await restore({ data: { password: getPw(), backup: pendingBackup } }); toast.success("Copia restaurada"); setPendingBackup(null); setS(null); qc.invalidateQueries(); } catch (err) { toast.error((err as Error).message); } }}
              trigger={<button className="mt-2 w-full rounded-lg border border-warning py-2 text-sm text-warning">Confirmar restauración</button>} />
          )}
        </Card>
        <Card t="Zona peligrosa">
          <ConfirmDelete title="Eliminar base de datos de socios" description="Se borrarán todos los socios, pagos, entrenos y avisos. No se puede deshacer."
            onConfirm={() => mut.mutate({ table: "members", action: "deleteAll" }, { onSuccess: () => toast.success("Socios eliminados") })}
            trigger={<button className="mb-2 w-full rounded-lg border border-destructive py-2 text-sm text-destructive">Eliminar base de datos de socios</button>} />
          <ConfirmDelete title="Eliminar base de datos de ejercicios" description="Se borrarán todos los ejercicios del catálogo."
            onConfirm={() => mut.mutate({ table: "exercises", action: "deleteAll" }, { onSuccess: () => toast.success("Ejercicios eliminados") })}
            trigger={<button className="w-full rounded-lg border border-destructive py-2 text-sm text-destructive">Eliminar base de datos de ejercicios</button>} />
        </Card>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="panel max-h-[85vh] w-full max-w-4xl overflow-auto">
            <h2 className="mb-2 text-2xl font-bold uppercase">Vista previa · {preview.rows.length} filas</h2>
            <table className="w-full text-xs"><thead><tr>{Object.keys(preview.rows[0] ?? {}).map((k) => <th key={k} className="p-1 text-left text-muted-foreground">{k}</th>)}</tr></thead>
              <tbody>{preview.rows.slice(0, 50).map((r, i) => <tr key={i} className="border-t">{Object.values(r).map((v, j) => <td key={j} className="p-1">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</td>)}</tr>)}</tbody></table>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button onClick={confirmImport} disabled={!preview.rows.length} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Guardar importación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ t, children }: { t: string; children: React.ReactNode }) {
  return <div className="panel"><h2 className="mb-3 text-lg font-bold uppercase">{t}</h2>{children}</div>;
}
