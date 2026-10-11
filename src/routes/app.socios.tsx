import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { WorkoutEditor } from "@/components/WorkoutEditor";
import { useAppData, useMutate, currentMonth, fullName, fee, age, KIND_LABEL, type Member } from "@/lib/store";
import { validateAssignment, allowedTimes, todayISO, DAY_NAMES } from "@/lib/schedule";
import { randomPin } from "@/lib/pin";
import { isWeakPin } from "@/lib/validation";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/app/socios")({ head: () => pageHead("Socios", "Fichas de socios, horarios asignados y entrenamientos personales."), component: Socios });

const empty = (): Partial<Member> => ({
  first_name: "", last_name: "", phone: "", pin: randomPin(), birth_date: null,
  join_date: todayISO(), active: true, plan_days: 2, schedule: {}, conditions: [], notes: "", consent: false, consent_date: null,
});

function Socios() {
  const { data } = useAppData();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Member> | null>(null);
  if (!data) return null;
  const month = currentMonth();
  const pay = Object.fromEntries(data.payments.filter((p) => p.month === month).map((p) => [p.member_id, p]));
  const list = data.members
    .filter((m) => `${fullName(m)} ${m.phone}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.first_name.localeCompare(b.first_name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black uppercase">Socios</h1>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className="field pl-8" placeholder="Buscar nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button onClick={() => setEdit(empty())} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Nuevo socio</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => {
          const p = pay[m.id];
          return (
            <button key={m.id} onClick={() => setEdit(m)} className={`panel text-left transition hover:border-primary/60 ${m.active ? "" : "opacity-50"}`}>
              <div className="flex justify-between"><b className="text-lg">{fullName(m)}</b>{!m.active && <span className="text-xs text-warning">Inactivo</span>}</div>
              <div className="text-sm text-muted-foreground">{m.phone}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(m.schedule ?? {}).map(([d, t]) => <span key={d} className="rounded bg-secondary px-1.5 py-0.5 text-xs">{d} {t}</span>)}
              </div>
              <div className={`mt-2 text-sm font-semibold ${p?.paid ? "text-success" : "text-warning"}`}>{p?.paid ? `Pagado · ${p.method}` : "Pendiente"}</div>
              {(m.recovery_sessions ?? 0) > 0 && <div className="mt-1 text-xs text-warning">{m.recovery_sessions} sesión(es) por recuperar</div>}
            </button>
          );
        })}
      </div>
      {edit && <MemberDialog member={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MemberDialog({ member, onClose }: { member: Partial<Member>; onClose: () => void }) {
  const { data, settings } = useAppData();
  const mut = useMutate();
  const [m, setM] = useState<Partial<Member>>(member);
  const [tab, setTab] = useState<"ficha" | "entrenos">("ficha");
  const [newCond, setNewCond] = useState({ kind: "lesion", name: "" });
  if (!data || !settings) return null;
  const month = currentMonth();
  const pay = m.id ? data.payments.find((p) => p.member_id === m.id && p.month === month) : undefined;
  const set = <K extends keyof Member>(k: K, v: Member[K]) => setM({ ...m, [k]: v });
  const days = settings.open_days;
  const times = allowedTimes(settings.class_times);

  const save = () => {
    if (!m.first_name?.trim() || !m.phone?.trim()) { toast.error("Nombre y teléfono son obligatorios"); return; }
    if (!/^\d{4,8}$/.test(m.pin ?? "")) { toast.error("El PIN debe tener entre 4 y 8 dígitos"); return; }
    if (isWeakPin(m.pin ?? "")) { toast.error("PIN demasiado fácil de adivinar: evita 0000, 1234, repetidos o secuencias"); return; }
    if (Object.keys(m.schedule ?? {}).length !== m.plan_days) toast.warning(`La tarifa es de ${m.plan_days} días y tiene ${Object.keys(m.schedule ?? {}).length} asignados`);
    for (const [d, t] of Object.entries(m.schedule ?? {})) {
      const err = validateAssignment(data.members, m.id ?? null, d, t, settings.capacity, settings.overlap_max);
      if (err && m.active) { toast.error(err); return; }
    }
    const row = { ...m, consent_date: m.consent ? m.consent_date ?? todayISO() : null };
    mut.mutate({ table: "members", action: "upsert", rows: [row] }, { onSuccess: () => { toast.success("Socio guardado"); onClose(); } });
  };
  const toggleCond = (n: string) => set("conditions", m.conditions?.includes(n) ? m.conditions.filter((c) => c !== n) : [...(m.conditions ?? []), n]);
  const markPay = (method: string | null) => {
    if (!m.id) return undefined;
    mut.mutate({ table: "payments", action: "upsert", onConflict: "member_id,month",
      rows: [{ member_id: m.id, month, amount: fee(m as Member, settings), method, paid: !!method, paid_at: method ? new Date().toISOString() : null }] });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl uppercase">{m.id ? fullName(m as Member) : "Nuevo socio"}</DialogTitle></DialogHeader>
        {m.id && (
          <div className="flex gap-2">
            {(["ficha", "entrenos"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-full border px-3 py-1 text-sm capitalize ${tab === t ? "border-primary bg-accent text-accent-foreground" : ""}`}>{t === "ficha" ? "Ficha" : "Entrenos y sesiones"}</button>)}
          </div>
        )}
        {tab === "entrenos" && m.id ? <WorkoutEditor memberId={m.id} /> : (
          <div className="space-y-4">
            {m.id && (
              <div className="panel flex flex-wrap items-center gap-2">
                <span className="text-sm">Cuota {month}: <b className={pay?.paid ? "text-success" : "text-warning"}>{pay?.paid ? `Pagada (${pay.method})` : "Pendiente"}</b></span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {settings.payment_methods.map((pm) => <button key={pm} onClick={() => markPay(pm)} className={`rounded border px-2 py-0.5 text-xs ${pay?.method === pm && pay.paid ? "border-primary text-primary" : ""}`}>{pm}</button>)}
                  <button onClick={() => markPay(null)} className="rounded border px-2 py-0.5 text-xs text-warning">Pendiente</button>
                </div>
              </div>
            )}
            {m.id && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="panel">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Sesiones realizadas</div>
                  <div className="font-display text-4xl font-black text-primary">{data.workouts.filter((w) => w.member_id === m.id && w.date <= todayISO()).length}</div>
                </div>
                <div className="panel space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Pendientes de recuperar</div>
                  <div className="flex items-center gap-2">
                    <button aria-label="Restar sesión" onClick={() => set("recovery_sessions", Math.max(0, (m.recovery_sessions ?? 0) - 1))} className="rounded-lg border px-3 py-1 text-lg">−</button>
                    <span className={`font-display text-4xl font-black ${(m.recovery_sessions ?? 0) > 0 ? "text-warning" : "text-muted-foreground"}`}>{m.recovery_sessions ?? 0}</span>
                    <button aria-label="Sumar sesión" onClick={() => set("recovery_sessions", (m.recovery_sessions ?? 0) + 1)} className="rounded-lg border px-3 py-1 text-lg">+</button>
                  </div>
                  <input className="field" placeholder="Motivo (ej. lesión, enfermedad…)" value={m.recovery_notes ?? ""} onChange={(e) => set("recovery_notes", e.target.value)} />
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Nombre"><input className="field" value={m.first_name} onChange={(e) => set("first_name", e.target.value)} /></L>
              <L label="Apellidos"><input className="field" value={m.last_name} onChange={(e) => set("last_name", e.target.value)} /></L>
              <L label="Teléfono"><input className="field" value={m.phone} onChange={(e) => set("phone", e.target.value)} /></L>
              <L label="PIN acceso socio (4-8 dígitos)"><div className="flex gap-2"><input className="field" inputMode="numeric" maxLength={8} value={m.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} /><button type="button" onClick={() => set("pin", randomPin())} className="shrink-0 rounded-lg border px-2 text-xs">Generar</button></div></L>
              <L label={`Fecha de nacimiento${age(m.birth_date ?? null) != null ? ` (${age(m.birth_date ?? null)} años)` : ""}`}><input type="date" className="field" value={m.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value || null)} /></L>
              <L label="Fecha de alta"><input type="date" className="field" value={m.join_date} onChange={(e) => set("join_date", e.target.value)} /></L>
              <L label="Estado">
                <select className="field" value={m.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}><option value="1">Activo</option><option value="0">Inactivo / baja temporal</option></select>
              </L>
              <L label="Tarifa">
                <select className="field" value={m.plan_days} onChange={(e) => set("plan_days", Number(e.target.value))}>
                  {Object.entries(settings.tariffs).map(([d, p]) => <option key={d} value={d}>{d} días/semana · {p} €</option>)}
                </select>
              </L>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Días y hora (medias = normal, en punto = solapa)</div>
              <div className="grid grid-cols-5 gap-2">
                {days.map((d) => (
                  <div key={d} className="space-y-1 text-center">
                    <div className="text-sm font-semibold">{(DAY_NAMES[d] ?? d).slice(0, 3)}</div>
                    <select className="field px-1 text-xs" value={m.schedule?.[d] ?? ""} onChange={(e) => {
                      const s = { ...(m.schedule ?? {}) }; if (e.target.value) s[d] = e.target.value; else delete s[d]; set("schedule", s);
                    }}>
                      <option value="">—</option>{times.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Lesiones, patologías, condiciones y objetivos (datos de salud)</div>
              {(["lesion", "patologia", "condicion", "objetivo"] as const).map((k) => (
                <div key={k} className="mb-2">
                  <div className="text-xs font-semibold text-primary">{KIND_LABEL[k]}</div>
                  <div className="flex flex-wrap gap-1">
                    {data.conditions.filter((c) => c.kind === k).map((c) => (
                      <button key={c.id} onClick={() => toggleCond(c.name)} className={`rounded-full border px-2 py-0.5 text-xs ${m.conditions?.includes(c.name) ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <select className="field w-36" value={newCond.kind} onChange={(e) => setNewCond({ ...newCond, kind: e.target.value })}>
                  {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>Añadir {l.toLowerCase()}</option>)}
                </select>
                <input className="field" placeholder="Nombre" value={newCond.name} onChange={(e) => setNewCond({ ...newCond, name: e.target.value })} />
                <button disabled={!newCond.name.trim()} onClick={() => mut.mutate({ table: "conditions", action: "insertMany", rows: [{ ...newCond, name: newCond.name.trim() }] }, { onSuccess: () => setNewCond({ ...newCond, name: "" }) })} className="rounded-lg border px-3 text-sm">Añadir</button>
              </div>
            </div>
            <L label="Notas"><textarea className="field" rows={3} value={m.notes} onChange={(e) => set("notes", e.target.value)} /></L>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-[var(--primary)]" checked={!!m.consent} onChange={(e) => set("consent", e.target.checked)} />
              <span>El socio da su consentimiento expreso para el tratamiento de sus datos de salud con fines de entrenamiento (RGPD art. 9 / LOPDGDD).{m.consent_date && <span className="text-muted-foreground"> Firmado {m.consent_date}.</span>}</span>
            </label>
            <div className="flex gap-2">
              {m.id && <ConfirmDelete title="Eliminar socio" description={`Se eliminará ${fullName(m as Member)} con sus pagos y entrenos.`}
                onConfirm={() => mut.mutate({ table: "members", action: "delete", id: m.id! }, { onSuccess: onClose })}
                trigger={<button className="rounded-lg border border-destructive px-4 py-2 text-sm text-destructive">Eliminar</button>} />}
              <button onClick={save} className="ml-auto rounded-lg bg-primary px-6 py-2 font-semibold text-primary-foreground">Guardar</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}
