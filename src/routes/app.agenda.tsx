import { createFileRoute } from "@tanstack/react-router";
import { useAppData, fullName } from "@/lib/store";
import { slotMembers, DAY_NAMES, todayCode } from "@/lib/schedule";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/app/agenda")({ head: () => pageHead("Agenda semanal", "Sesiones semanales y ocupación de las clases del centro."), component: Agenda });

function Agenda() {
  const { data, settings } = useAppData();
  if (!data || !settings) return null;
  const days = settings.open_days;
  const times = [...settings.class_times].sort();
  const today = todayCode();
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl font-black uppercase">Agenda semanal</h1>
        <p className="text-xs text-muted-foreground">Aforo {settings.capacity} · <span className="text-success">verde</span> normal · <span className="text-destructive">rojo</span> con solapamiento</p>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] gap-2" style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d) => <div key={d} className={`text-center font-display text-lg font-bold uppercase ${d === today ? "text-primary" : ""}`}>{DAY_NAMES[d]}</div>)}
          {times.map((t) => (
            <Row key={t} t={t} days={days} />
          ))}
        </div>
      </div>
    </div>
  );

  function Row({ t, days }: { t: string; days: string[] }) {
    return (
      <>
        <div className="pt-2 font-display text-lg font-bold text-muted-foreground">{t}</div>
        {days.map((d) => {
          const { regular, overlap, count } = slotMembers(data!.members, d, t);
          const over = count > settings!.capacity;
          return (
            <div key={d} className={`panel min-h-20 p-2 ${over ? "border-destructive/60" : ""}`}>
              <div className={`text-right font-display text-xl font-black ${over ? "text-destructive" : count ? "text-success" : "text-muted-foreground"}`}>{count}/{settings!.capacity}</div>
              {regular.map((m) => <div key={m.id} className="truncate text-xs">{fullName(m)}</div>)}
              {overlap.map((m) => <div key={m.id} className="truncate text-xs text-destructive">{fullName(m)} · {m.schedule[d]}</div>)}
            </div>
          );
        })}
      </>
    );
  }
}
