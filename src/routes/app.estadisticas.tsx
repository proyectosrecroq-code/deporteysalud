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
  LineChart,
  Line,
} from "recharts";
import type { ReactElement } from "react";
import {
  useAppData,
  currentMonth,
  lastMonths,
  monthLabel,
  age,
  fee,
  KIND_LABEL,
} from "@/lib/store";
import { DAY_NAMES } from "@/lib/schedule";
import { COLORS, tip } from "@/lib/chart";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/app/estadisticas")({
  head: () => pageHead("Estadísticas", "Ocupación, tarifas y evolución de los socios del centro."),
  component: Stats,
});

const AGE_GROUPS = [
  [0, 25, "<25"],
  [25, 35, "25-34"],
  [35, 45, "35-44"],
  [45, 55, "45-54"],
  [55, 65, "55-64"],
  [65, 200, "65+"],
] as const;
const ageGroup = (a: number | null) =>
  a == null ? "—" : (AGE_GROUPS.find(([lo, hi]) => a >= lo && a < hi)?.[2] ?? "—");

function Stats() {
  const { data, settings } = useAppData();
  if (!data || !settings) return null;
  const active = data.members.filter((m) => m.active);
  const month = currentMonth();
  const seats = settings.open_days.length * settings.class_times.length * settings.capacity;
  const used = active.reduce((s, m) => s + Object.keys(m.schedule ?? {}).length, 0);
  const occ = seats ? Math.round((used / seats) * 100) : 0;
  const expected = active.reduce((s, m) => s + fee(m, settings), 0);
  const ages = active.map((m) => age(m.birth_date)).filter((a): a is number => a != null);
  const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  const unpaidOld = new Set(
    data.payments.filter((p) => p.month < month && !p.paid).map((p) => p.member_id),
  );
  const absences = new Set(
    data.member_requests
      .filter((r) => r.type === "ausencia" && r.status === "pendiente")
      .map((r) => r.member_id),
  );
  const bajas = data.members.filter(
    (m) => !m.active || unpaidOld.has(m.id) || absences.has(m.id),
  ).length;

  const perDay = settings.open_days.map((d) => ({
    name: (DAY_NAMES[d] ?? d).slice(0, 3),
    socios: active.filter((m) => m.schedule?.[d]).length,
  }));
  const hours = [...new Set(active.flatMap((m) => Object.values(m.schedule ?? {})))].sort();
  const perHour = hours.map((h) => ({
    name: h,
    socios: active.reduce(
      (s, m) => s + Object.values(m.schedule ?? {}).filter((t) => t === h).length,
      0,
    ),
  }));
  const altas = lastMonths(12).map((mo) => ({
    name: monthLabel(mo),
    altas: data.members.filter((m) => m.join_date.startsWith(mo)).length,
  }));
  const tariffs = Object.keys(settings.tariffs).map((d) => ({
    name: `${d} días`,
    value: active.filter((m) => String(m.plan_days) === d).length,
  }));
  const condCount = (kinds: string[]) =>
    data.conditions
      .filter((c) => kinds.includes(c.kind))
      .map((c) => ({
        name: c.name,
        n: active.filter((m) => m.conditions.includes(c.name)).length,
        kind: KIND_LABEL[c.kind],
      }))
      .filter((x) => x.n)
      .sort((a, b) => b.n - a.n);
  const health = condCount(["lesion", "patologia", "condicion"]);
  const goals = condCount(["objetivo"]);
  const byAge = AGE_GROUPS.map(([, , g]) => ({
    name: g,
    socios: active.filter((m) => ageGroup(age(m.birth_date)) === g).length,
  }));
  const yrs = (d: string) => (Date.now() - new Date(d).getTime()) / (365.25 * 864e5);
  const seniority = [
    ["<6 meses", 0, 0.5],
    ["6-12 meses", 0.5, 1],
    ["1-2 años", 1, 2],
    ["2-3 años", 2, 3],
    ["+3 años", 3, 99],
  ].map(([n, lo, hi]) => ({
    name: n as string,
    socios: active.filter(
      (m) => yrs(m.join_date) >= (lo as number) && yrs(m.join_date) < (hi as number),
    ).length,
  }));
  const goalNames = data.conditions.filter((c) => c.kind === "objetivo").map((c) => c.name);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black uppercase">Estadísticas</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <K l="Ocupación semanal" v={`${occ}%`} sub={`${used}/${seats} plazas`} />
        <K l="Ingreso mensual previsto" v={`${expected} €`} />
        <K l="Edad media" v={`${avgAge} años`} />
        <K l="Posibles bajas" v={bajas} tone="text-warning" sub="inactivos, impagos o ausencias" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <C t="Socios por día">
          <BarChart data={perDay}>
            <G />
            <Bar dataKey="socios" fill="var(--primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </C>
        <C t="Socios por hora">
          <BarChart data={perHour}>
            <G />
            <Bar dataKey="socios" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </C>
        <C t="Altas últimos 12 meses">
          <LineChart data={altas}>
            <G />
            <Line dataKey="altas" stroke="var(--primary)" strokeWidth={3} />
          </LineChart>
        </C>
        <C t="Socios por tarifa">
          <PieChart>
            <Pie
              data={tariffs}
              dataKey="value"
              nameKey="name"
              outerRadius={80}
              label={({ name, value }) => `${name}: ${value}`}
            >
              {tariffs.map((_, i) => (
                <Cell key={i} fill={COLORS[i % 5]!} />
              ))}
            </Pie>
            <Tooltip {...tip} />
          </PieChart>
        </C>
        <C t="Lesiones, patologías y condiciones">
          <BarChart data={health} layout="vertical">
            <CartesianGrid stroke="var(--border)" />
            <XAxis
              type="number"
              stroke="var(--muted-foreground)"
              fontSize={11}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <Tooltip {...tip} />
            <Bar dataKey="n" fill="var(--chart-4)" />
          </BarChart>
        </C>
        <C t="Objetivos">
          <BarChart data={goals} layout="vertical">
            <CartesianGrid stroke="var(--border)" />
            <XAxis
              type="number"
              stroke="var(--muted-foreground)"
              fontSize={11}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <Tooltip {...tip} />
            <Bar dataKey="n" fill="var(--primary)" />
          </BarChart>
        </C>
        <C t="Socios por edad">
          <BarChart data={byAge}>
            <G />
            <Bar dataKey="socios" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </C>
        <C t="Antigüedad">
          <BarChart data={seniority}>
            <G />
            <Bar dataKey="socios" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </C>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Matrix
          t="Tarifas según edad"
          cols={Object.keys(settings.tariffs).map((d) => `${d} días`)}
          cell={(g, c) =>
            active.filter((m) => ageGroup(age(m.birth_date)) === g && `${m.plan_days} días` === c)
              .length
          }
        />
        <Matrix
          t="Objetivos según edad"
          cols={goalNames}
          cell={(g, c) =>
            active.filter((m) => ageGroup(age(m.birth_date)) === g && m.conditions.includes(c))
              .length
          }
        />
      </div>
    </div>
  );
}

const G = () => (
  <>
    <CartesianGrid stroke="var(--border)" vertical={false} />
    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
    <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
    <Tooltip {...tip} />
  </>
);
function K({
  l,
  v,
  sub,
  tone = "text-primary",
}: {
  l: string;
  v: string | number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="panel">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div>
      <div className={`mt-2 font-display text-4xl font-black ${tone}`}>{v}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
function C({ t, children }: { t: string; children: ReactElement }) {
  return (
    <div className="panel">
      <h2 className="mb-2 text-lg font-bold uppercase">{t}</h2>
      <div className="h-60">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
function Matrix({
  t,
  cols,
  cell,
}: {
  t: string;
  cols: string[];
  cell: (g: string, c: string) => number;
}) {
  return (
    <div className="panel overflow-x-auto">
      <h2 className="mb-2 text-lg font-bold uppercase">{t}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="p-1 text-left text-muted-foreground">Edad</th>
            {cols.map((c) => (
              <th key={c} className="p-1 text-xs font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AGE_GROUPS.map(([, , g]) => (
            <tr key={g} className="border-t">
              <td className="p-1 font-semibold">{g}</td>
              {cols.map((c) => {
                const n = cell(g, c);
                return (
                  <td
                    key={c}
                    className={`p-1 text-center ${n ? "font-bold text-primary" : "text-muted-foreground"}`}
                  >
                    {n || "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
