import { useState } from 'react';
import { Plus, Trash2, Wand2, Pencil, Save, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAppData, useMutate, type Workout, type WorkoutBlock, type WorkoutItem } from '@/lib/store';
import { generateWorkout, type WorkoutType } from '@/lib/workout-gen';
import { todayISO } from '@/lib/schedule';
import { editableBlocks, previousLoad, canRecordLoad } from '@/lib/workout-loads';
import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { toast } from 'sonner';

const todayDate = () => todayISO();
type Draft = { id?: string; title: string; blocks: WorkoutBlock[]; date: string; type: WorkoutType };
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-ES');

export function WorkoutEditor({ memberId }: { memberId: string }) {
  const { data } = useAppData();
  const mut = useMutate();
  const [type, setType] = useState<WorkoutType>('Completo');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const today = todayDate();
  const history = data.workouts.filter(w => w.member_id === memberId).sort((a, b) => b.date.localeCompare(a.date));
  const recent = history.filter(w => w.date <= today).slice(0, 4);
  const visible = showAll ? history : recent;
  const updateBlock = (index: number, edit: (block: WorkoutBlock) => void) => {
    if (!draft) return;
    const blocks = structuredClone(draft.blocks);
    const block = blocks[index];
    if (!block) return;
    edit(block); setDraft({ ...draft, blocks });
  };
  const updateItem = (bi: number, ii: number, key: keyof WorkoutItem, value: string) => updateBlock(bi, block => {
    const item = block.items[ii]; if (item) item[key] = value;
  });
  const save = () => {
    if (!draft || !draft.title.trim() || !draft.date) return;
    const blocks = editableBlocks(draft.blocks).map(b => ({ ...b, items: b.items.map(item => {
      if (!canRecordLoad(draft.date, today)) { const { recordedLoad: _result, ...rest } = item; return rest; }
      return item;
    }) }));
    mut.mutate({ table: 'workouts', action: 'upsert', rows: [{ ...draft, blocks, member_id: memberId }] }, {
      onSuccess: () => { toast.success('Entreno guardado'); setDraft(null); },
    });
  };
  const edit = (workout: Workout) => {
    const workoutType = ['Completo', 'WOD', 'Hyrox', 'Sueltos'].includes(workout.type) ? workout.type as WorkoutType : 'Completo';
    setType(workoutType);
    setDraft({ id: workout.id, title: workout.title, date: workout.date, type: workoutType, blocks: editableBlocks(workout.blocks) });
  };
  return (
    <div className="space-y-5">
      {!draft && <div className="flex flex-wrap gap-2">
        {(['Completo', 'WOD', 'Hyrox', 'Sueltos'] as WorkoutType[]).map(t => <Button key={t} variant={type === t ? 'default' : 'outline'} size="sm" onClick={() => setType(t)}>{t}</Button>)}
        <Button className="sm:ml-auto" onClick={() => setDraft({ ...generateWorkout(type, data.exercises), date: today, type })}><Wand2 />Generar</Button>
        <Button variant="outline" onClick={() => setDraft({ title: 'Entreno manual', blocks: [{ block: 'Ejercicios', items: [] }], date: today, type })}><Plus />Crear manual</Button>
      </div>}
      {draft && <section className="space-y-4 border-y border-primary/40 py-4">
        <div className="flex items-center justify-between gap-2"><h3 className="text-xl font-bold uppercase">{draft.id ? 'Editar entreno' : 'Nuevo entreno'}</h3><Button variant="ghost" size="icon" aria-label="Cancelar edición" title="Cancelar edición" onClick={() => setDraft(null)}><X /></Button></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
          <label className="text-xs text-muted-foreground">Título<input aria-label="Título del entreno" className="field mt-1" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Fecha<input aria-label="Fecha del entreno" type="date" className="field mt-1" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Tipo<select aria-label="Tipo de entreno" className="field mt-1" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as WorkoutType })}>{['Completo', 'WOD', 'Hyrox', 'Sueltos'].map(t => <option key={t}>{t}</option>)}</select></label>
        </div>
        {draft.blocks.map((block, bi) => <div key={bi} className="space-y-3">
          <div className="flex gap-2"><input aria-label={`Nombre del bloque ${bi + 1}`} className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold uppercase text-primary outline-none" value={block.block} onChange={e => updateBlock(bi, b => { b.block = e.target.value; })} /><Button variant="ghost" size="icon" title="Quitar bloque" aria-label={`Quitar bloque ${bi + 1}`} onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((_, i) => i !== bi) })}><Trash2 /></Button></div>
          {block.items.map((item, ii) => {
            const last = previousLoad(history, item.name, draft.date, draft.id);
            return <div key={ii} className="space-y-1 border-b border-border pb-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]">
                <label className="col-span-2 min-w-0 text-xs text-muted-foreground sm:col-span-1">Ejercicio<select aria-label={`Ejercicio ${bi + 1}-${ii + 1}`} className="field mt-1" value={item.name} onChange={e => updateItem(bi, ii, 'name', e.target.value)}><option>{item.name}</option>{data.exercises.filter(e => e.name !== item.name).map(e => <option key={e.id}>{e.name}</option>)}</select></label>
                <label className="col-start-1 text-xs text-muted-foreground sm:col-start-auto">Series<input aria-label={`Series ${bi + 1}-${ii + 1}`} className="field mt-1" value={item.sets ?? ''} onChange={e => updateItem(bi, ii, 'sets', e.target.value)} /></label>
                <label className="text-xs text-muted-foreground">Reps / tiempo<input aria-label={`Repeticiones ${bi + 1}-${ii + 1}`} className="field mt-1" value={item.reps ?? ''} onChange={e => updateItem(bi, ii, 'reps', e.target.value)} /></label>
                <Button variant="ghost" size="icon" className="col-start-3 row-start-1 self-end sm:col-start-auto sm:row-start-auto" aria-label={`Quitar ejercicio ${bi + 1}-${ii + 1}`} title="Quitar ejercicio" onClick={() => updateBlock(bi, b => { b.items.splice(ii, 1); })}><Trash2 /></Button>
              </div>
              <div className="flex flex-wrap items-end gap-4 pt-2">
                {canRecordLoad(draft.date, today) && <label className="w-40 text-xs text-muted-foreground">Peso final realizado (kg)<input type="number" min="0" step="0.5" aria-label={`Peso final realizado ${bi + 1}-${ii + 1}`} className="field mt-1" placeholder="Sin registrar" value={item.recordedLoad ?? ''} onChange={e => updateItem(bi, ii, 'recordedLoad', e.target.value)} /></label>}
                {last && <span className="pb-2 text-xs text-muted-foreground">Última sesión: <b className="text-foreground">{last.kg} kg</b> · {dateLabel(last.date)}</span>}
              </div>
            </div>;
          })}
          <Button variant="ghost" size="sm" onClick={() => updateBlock(bi, b => { b.items.push({ name: data.exercises[0]?.name ?? 'Ejercicio' }); })}><Plus />Añadir ejercicio</Button>
        </div>)}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { block: 'Nuevo bloque', items: [] }] })}><Plus />Bloque</Button><Button className="ml-auto" disabled={mut.isPending || !draft.title.trim() || !draft.date} onClick={save}><Save />{mut.isPending ? 'Guardando…' : 'Guardar entreno'}</Button></div>
      </section>}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold uppercase text-muted-foreground">{showAll ? 'Todos los entrenos' : 'Últimos 4 entrenos'}</h3><Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver últimos 4' : `Ver todos (${history.length})`}</Button></div>
        {!visible.length && <p className="text-sm text-muted-foreground">Sin entrenos realizados todavía.</p>}
        <div className="grid gap-3 sm:grid-cols-2">{visible.map(w => <WorkoutCard key={w.id} w={w} onEdit={() => edit(w)} onDelete={() => mut.mutate({ table: 'workouts', action: 'delete', id: w.id })} />)}</div>
      </section>
      <LoadProgress workouts={history} />
    </div>
  );
}

function WorkoutCard({ w, onEdit, onDelete }: { w: Workout; onEdit: () => void; onDelete: () => void }) {
  return <div className="panel min-w-0 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><b>{w.title}</b><span className="text-muted-foreground">{dateLabel(w.date)}</span></div>
    {w.blocks.map((b, i) => <div key={i} className="mt-2"><div className="text-xs font-semibold uppercase text-primary">{b.block}</div>{b.items.map((item, j) => <div key={j} className="break-words text-muted-foreground">{item.name} {item.sets && `${item.sets}×`}{item.reps}{item.recordedLoad !== undefined && item.recordedLoad !== '' && <span className="text-foreground"> · Realizado: {item.recordedLoad} kg</span>}</div>)}</div>)}
    <div className="mt-3 flex items-center justify-between"><Button variant="outline" size="sm" onClick={onEdit}><Pencil />Editar / registrar pesos</Button><ConfirmDelete title="Eliminar entreno" description="Se eliminarán este entreno y sus resultados registrados." onConfirm={onDelete} trigger={<Button variant="ghost" size="icon" title="Eliminar entreno" aria-label="Eliminar entreno"><Trash2 className="text-destructive" /></Button>} /></div>
  </div>;
}

function LoadProgress({ workouts }: { workouts: Workout[] }) {
  const series: Record<string, { date: string; kg: number }[]> = {};
  [...workouts].filter(w => w.date <= todayDate()).reverse().forEach(w => w.blocks.forEach(b => b.items.forEach(item => {
    const kg = Number.parseFloat(item.recordedLoad ?? '');
    if (Number.isFinite(kg)) (series[item.name] ??= []).push({ date: dateLabel(w.date), kg });
  })));
  const names = Object.keys(series);
  const [selected, setSelected] = useState('');
  const exercise = names.includes(selected) ? selected : names[0] ?? '';
  if (!names.length) return <p className="text-sm text-muted-foreground">Sin pesos finales registrados.</p>;
  return <section className="space-y-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold uppercase">Progresión de cargas realizadas</h3><select aria-label="Ejercicio de progresión" className="field w-full sm:w-56" value={exercise} onChange={e => setSelected(e.target.value)}>{names.map(n => <option key={n}>{n}</option>)}</select></div>
    <div className="h-48"><ResponsiveContainer><LineChart data={series[exercise] ?? []}><CartesianGrid stroke="var(--border)" /><XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} /><YAxis stroke="var(--muted-foreground)" fontSize={12} /><Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }} /><Line dataKey="kg" stroke="var(--primary)" strokeWidth={3} dot /></LineChart></ResponsiveContainer></div>
  </section>;
}
