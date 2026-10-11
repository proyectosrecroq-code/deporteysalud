import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import {
  useAppData,
  useMutate,
  currentMonth,
  lastMonths,
  monthLabel,
  fullName,
  fee,
} from "@/lib/store";
import { COLORS, tip } from "@/lib/chart";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/app/finanzas")({
  head: () => pageHead("Finanzas", "Ingresos mensuales, cuotas pendientes y métodos de pago."),
  component: Finanzas,
});

function Finanzas() {
  const { data, settings } = useAppData();
  const mut = useMutate();
  if (!data || !settings) return null;
  const month = currentMonth();
  const active = data.members.filter((m) => m.active);
  const pm = Object.fromEntries(
    data.payments.filter((p) => p.month === month).map((p) => [p.member_id, p]),
  );
  const expected = active.reduce((s, m) => s + fee(m, settings), 0);
  const paid = data.payments
    .filter((p) => p.month === month && p.paid)
    .reduce((s, p) => s + Number(p.amount), 0);
  const pending = Math.max(expected - paid, 0);
  const pct = expected ? Math.round((paid / expected) * 100) : 0;
  const hist = lastMonths(6).map((mo) => ({
    mes: monthLabel(mo),
    cobrado: data.payments
      .filter((p) => p.month === mo && p.paid)
      .reduce((s, p) => s + Number(p.amount), 0),
  }));
  const byMethod = settings.payment_methods.map((name) => ({
    name,
    value: data.payments
      .filter((p) => p.month === month && p.paid && p.method === name)
      .reduce((s, p) => s + Number(p.amount), 0),
  }));

  const setPay = (memberId: string, amount: number, method: string | null) =>
    mut.mutate({
      table: "payments",
      action: "upsert",
      onConflict: "member_id,month",
      rows: [
        {
          member_id: memberId,
          month,
          amount,
          method,
          paid: !!method,
          paid_at: method ? new Date().toISOString() : null,
        },
      ],
    });

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black uppercase">
        Finanzas <span className="text-muted-foreground">{monthLabel(month)}</span>
      </h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <K label="Cobrado" v={`${paid} €`} />
        <K label="Pendiente" v={`${pending} €`} tone="text-warning" />
        <K label="Previsto total" v={`${expected} €`} tone="text-foreground" />
        <div className="panel">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">% cobro</div>
          <div className="mt-2 font-display text-4xl font-black text-primary">{pct}%</div>
          <div className="mt-2 h-2 rounded bg-secondary">
            <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <h2 className="mb-2 text-xl font-bold uppercase">Últimos 6 meses</h2>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={hist}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip {...tip} />
                <Bar dataKey="cobrado" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h2 className="mb-2 text-xl font-bold uppercase">Por método</h2>
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={byMethod}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={70}
                >
                  {byMethod.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % 5]!} />
                  ))}
                </Pie>
                <Tooltip {...tip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {byMethod.map((b, i) => (
            <div key={b.name} className="flex justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % 5]! }} />
                {b.name}
              </span>
              <b>{b.value} €</b>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2 className="mb-3 text-xl font-bold uppercase">Cuotas del mes</h2>
        <div className="divide-y">
          {active
            .sort((a, b) => a.first_name.localeCompare(b.first_name))
            .map((m) => {
              const p = pm[m.id];
              const f = fee(m, settings);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-40 flex-1 font-medium">{fullName(m)}</span>
                  <span className="text-muted-foreground">
                    {m.plan_days} días · {f} €
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {settings.payment_methods.map((x) => (
                      <button
                        key={x}
                        onClick={() => setPay(m.id, f, x)}
                        className={`rounded border px-2 py-0.5 text-xs ${p?.paid && p.method === x ? "border-primary bg-primary text-primary-foreground" : ""}`}
                      >
                        {x}
                      </button>
                    ))}
                    <button
                      onClick={() => setPay(m.id, f, null)}
                      className={`rounded border px-2 py-0.5 text-xs ${!p?.paid ? "border-warning text-warning" : ""}`}
                    >
                      Pendiente
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function K({ label, v, tone = "text-success" }: { label: string; v: string; tone?: string }) {
  return (
    <div className="panel">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-4xl font-black ${tone}`}>{v}</div>
    </div>
  );
}
