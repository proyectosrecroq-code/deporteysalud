import { createFileRoute } from "@tanstack/react-router";
import { Cake, Users, CalendarCheck, Euro, AlertTriangle, Check, X } from "lucide-react";
import { useAppData, useMutate, currentMonth, fullName, fee, monthLabel } from "@/lib/store";
import { DAY_NAMES, todayCode } from "@/lib/schedule";

export const Route = createFileRoute("/app/")({ component: Inicio });

function Stat({ icon: Icon, label, value, tone = "text-primary" }: { icon: any; label: string; value: string | number; tone?: string }) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className={`mt-2 font-display text-4xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

function Inicio() {
  const { data, settings } = useAppData();
  const mut = useMutate();
  if (!data) return null;
  const month = currentMonth();
  const active = data.members.filter((m) => m.active);
  const today = todayCode();
  const todayMembers = active.filter((m) => m.schedule?.[today]).sort((a, b) => (a.schedule[today] ?? "").localeCompare(b.schedule[today] ?? ""));
  const paidMonth = data.payments.filter((p) => p.month === month && p.paid).reduce((s, p) => s + Number(p.amount), 0);
  const paidIds = new Set(data.payments.filter((p) => p.month === month && p.paid).map((p) => p.member_id));
  const pendingNow = active.filter((m) => !paidIds.has(m.id));
  const pendingOld = data.payments.filter((p) => p.month < month && !p.paid);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayWorkouts = data.workouts.filter((w) => w.date === todayStr);
  const requests = data.member_requests.filter((r) => r.status === "pendiente");
  const byId = Object.fromEntries(data.members.map((m) => [m.id, m]));

  const now = new Date();
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(now.getDate() - ((now.getDay() + 6) % 7) + i); return d; });
  const birthdays = data.members.flatMap((m) => {
    if (!m.birth_date) return [];
    const b = new Date(m.birth_date);
    const d = week.find((w) => w.getMonth() === b.getMonth() && w.getDate() === b.getDate());
    return d ? [{ m, d }] : [];
  });

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black uppercase">{DAY_NAMES[today]} <span className="text-muted-foreground">{now.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</span></h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Socios activos" value={active.length} />
        <Stat icon={CalendarCheck} label="Vienen hoy" value={todayMembers.length} />
        <Stat icon={Euro} label={`Cobrado ${monthLabel(month)}`} value={`${paidMonth} €`} />
        <Stat icon={AlertTriangle} label="Cuotas pendientes" value={pendingNow.length + pendingOld.length} tone="text-warning" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <h2 className="mb-3 text-xl font-bold uppercase">Hoy en el centro</h2>
          {todayMembers.length === 0 ? <p className="text-sm text-muted-foreground">Hoy no hay sesiones.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {todayMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
                  <span>{fullName(m)}</span><span className="font-display text-lg font-bold text-primary">{m.schedule[today]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <h2 className="mb-3 text-xl font-bold uppercase">Entrenos de hoy</h2>
          {todayWorkouts.length === 0 ? <p className="text-sm text-muted-foreground">Sin entrenos creados para hoy.</p> :
            todayWorkouts.map((w) => <div key={w.id} className="border-b py-1.5 text-sm last:border-0"><b>{byId[w.member_id]?.first_name}</b> · {w.title}</div>)}
        </div>
        <div className="panel">
          <h2 className="mb-3 text-xl font-bold uppercase">Avisos de socios</h2>
          {requests.length === 0 && <p className="text-sm text-muted-foreground">Sin avisos pendientes.</p>}
          {requests.map((r) => (
            <div key={r.id} className="mb-2 rounded-lg bg-secondary p-2 text-sm">
              <div className="flex justify-between"><b>{byId[r.member_id] ? fullName(byId[r.member_id]!) : "?"}</b>
                <span className={r.type === "cambio" ? "text-warning" : "text-destructive"}>{r.type === "cambio" ? "Cambio" : "Ausencia"}</span></div>
              <div className="text-muted-foreground">{DAY_NAMES[r.day ?? ""] ?? ""} {r.desired_time && `→ ${r.desired_time}`} · {r.message}</div>
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => mut.mutate({ table: "member_requests", action: "upsert", rows: [{ ...r, status: "aprobado" }] })} className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"><Check className="h-3 w-3" />Aprobar</button>
                <button onClick={() => mut.mutate({ table: "member_requests", action: "upsert", rows: [{ ...r, status: "rechazado" }] })} className="flex items-center gap-1 rounded border px-2 py-0.5 text-xs"><X className="h-3 w-3" />Rechazar</button>
              </div>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2 className="mb-3 text-xl font-bold uppercase">Cuotas pendientes</h2>
          {pendingNow.map((m) => <div key={m.id} className="flex justify-between py-1 text-sm"><span>{fullName(m)}</span><span className="text-warning">{monthLabel(month)} · {fee(m, settings)} €</span></div>)}
          {pendingOld.map((p) => <div key={p.id} className="flex justify-between py-1 text-sm"><span>{byId[p.member_id] ? fullName(byId[p.member_id]!) : "?"}</span><span className="text-destructive">{monthLabel(p.month)} · {p.amount} €</span></div>)}
          {pendingNow.length + pendingOld.length === 0 && <p className="text-sm text-muted-foreground">Todo al día.</p>}
        </div>
        <div className="panel">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold uppercase"><Cake className="h-5 w-5 text-primary" />Cumpleaños semana</h2>
          {birthdays.length === 0 && <p className="text-sm text-muted-foreground">Nadie cumple esta semana.</p>}
          {birthdays.map(({ m, d }) => (
            <div key={m.id} className="flex justify-between py-1 text-sm"><span>{fullName(m)}</span><span className="text-primary">{d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
