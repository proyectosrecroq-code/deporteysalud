import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAppData, useMutate, type Workout, type WorkoutBlock } from "@/lib/store";
import { generateWorkout, type WorkoutType } from "@/lib/workout-gen";

export function WorkoutEditor({ memberId }: { memberId: string }) {
  const { data } = useAppData();
  const mut = useMutate();
  const [type, setType] = useState<WorkoutType>("Completo");
  const [draft, setDraft] = useState<{ title: string; blocks: WorkoutBlock[]; date: string } | null>(null);
  if (!data) return null;
  const history = data.workouts.filter((w) => w.member_id === memberId).sort((a, b) => b.date.localeCompare(a.date));

  const gen = () => setDraft({ ...generateWorkout(type, data.exercises), date: new Date().toISOString().slice(0, 10) });
  const upd = (bi: number, ii: number, k: string, v: string) => {
    if (!draft) return;
    const blocks = structuredClone(draft.blocks);
    (blocks[bi]!.items[ii] as any)[k] = v;
    setDraft({ ...draft, blocks });
  };
  const save = () => {
    if (!draft) return;
    mut.mutate({ table: "workouts", action: "upsert", rows: [{ member_id: memberId, type, ...draft }] }, { onSuccess: () => setDraft(null) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["Completo", "WOD", "Hyrox", "Sueltos"] as WorkoutType[]).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-full border px-3 py-1 text-sm ${type === t ? "border-primary bg-accent text-accent-foreground" : ""}`}>{t}</button>
        ))}
        <button onClick={gen} className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"><Wand2 className="h-4 w-4" />Generar</button>
      </div>

      {draft && (
        <div className="panel space-y-3 border-primary/40">
          <div className="flex gap-2">
            <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <input type="date" className="field w-40" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </div>
          {draft.blocks.map((b, bi) => (
            <div key={bi} className="space-y-1.5">
              <input className="bg-transparent font-display text-lg font-bold uppercase text-primary outline-none" value={b.block}
                onChange={(e) => { const blocks = structuredClone(draft.blocks); blocks[bi]!.block = e.target.value; setDraft({ ...draft, blocks }); }} />
              {b.items.map((it, ii) => (
                <div key={ii} className="grid grid-cols-[1fr_3.5rem_4.5rem_4.5rem_auto] gap-1.5">
                  <select className="field" value={it.name} onChange={(e) => upd(bi, ii, "name", e.target.value)}>
                    <option>{it.name}</option>
                    {data.exercises.filter((e) => e.name !== it.name).map((e) => <option key={e.id}>{e.name}</option>)}
                  </select>
                  <input className="field" placeholder="Series" value={it.sets ?? ""} onChange={(e) => upd(bi, ii, "sets", e.target.value)} />
                  <input className="field" placeholder="Reps" value={it.reps ?? ""} onChange={(e) => upd(bi, ii, "reps", e.target.value)} />
                  <input className="field" placeholder="Kg" value={it.load ?? ""} onChange={(e) => upd(bi, ii, "load", e.target.value)} />
                  <button onClick={() => { const blocks = structuredClone(draft.blocks); blocks[bi]!.items.splice(ii, 1); setDraft({ ...draft, blocks }); }}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
                </div>
              ))}
              <button onClick={() => { const blocks = structuredClone(draft.blocks); blocks[bi]!.items.push({ name: data.exercises[0]?.name ?? "Ejercicio" }); setDraft({ ...draft, blocks }); }}
                className="flex items-center gap-1 text-xs text-primary"><Plus className="h-3 w-3" />Añadir ejercicio</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { block: "Nuevo bloque", items: [] }] })} className="rounded-lg border px-3 py-1.5 text-sm">+ Bloque</button>
            <button onClick={save} className="ml-auto rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">Guardar entreno</button>
          </div>
        </div>
      )}
      {!draft && <button onClick={() => setDraft({ title: "Entreno manual", blocks: [{ block: "Ejercicios", items: [] }], date: new Date().toISOString().slice(0, 10) })} className="text-sm text-primary">+ Crear entreno manual</button>}

      <div>
        <h3 className="mb-2 text-lg font-bold uppercase text-muted-foreground">Últimos 4 entrenos</h3>
        {history.length === 0 && <p className="text-sm text-muted-foreground">Sin entrenos todavía.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {history.slice(0, 4).map((w) => <WorkoutCard key={w.id} w={w} onDelete={() => mut.mutate({ table: "workouts", action: "delete", id: w.id })} />)}
        </div>
      </div>
      <LoadProgress workouts={history} />
    </div>
  );
}

function WorkoutCard({ w, onDelete }: { w: Workout; onDelete: () => void }) {
  return (
    <div className="panel text-sm">
      <div className="flex justify-between"><b>{w.title}</b><span className="text-muted-foreground">{new Date(w.date).toLocaleDateString("es-ES")}</span></div>
      {w.blocks.map((b, i) => (
        <div key={i} className="mt-1.5"><div className="text-xs font-semibold uppercase text-primary">{b.block}</div>
          {b.items.map((it, j) => <div key={j} className="text-muted-foreground">{it.name} {it.sets && `${it.sets}×`}{it.reps} {it.load && `· ${it.load} kg`}</div>)}</div>
      ))}
      <button onClick={onDelete} className="mt-2 text-xs text-destructive">Eliminar</button>
    </div>
  );
}

function LoadProgress({ workouts }: { workouts: Workout[] }) {
  const series: Record<string, { date: string; kg: number }[]> = {};
  [...workouts].reverse().forEach((w) => w.blocks.forEach((b) => b.items.forEach((it) => {
    const kg = parseFloat(it.load ?? "");
    if (!isNaN(kg)) (series[it.name] ??= []).push({ date: new Date(w.date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }), kg });
  })));
  const names = Object.keys(series);
  const [sel, setSel] = useState<string>("");
  const ex = sel || names[0] || "";
  if (!names.length) return <p className="text-sm text-muted-foreground">La progresión de cargas aparecerá al registrar kg en ejercicios de fuerza.</p>;
  return (
    <div className="panel">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold uppercase">Progresión de cargas</h3>
        <select className="field w-48" value={ex} onChange={(e) => setSel(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select>
      </div>
      <div className="h-48">
        <ResponsiveContainer><LineChart data={series[ex] ?? []}>
          <CartesianGrid stroke="var(--border)" /><XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} /><YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
          <Line dataKey="kg" stroke="var(--primary)" strokeWidth={3} dot />
        </LineChart></ResponsiveContainer>
      </div>
    </div>
  );
}
