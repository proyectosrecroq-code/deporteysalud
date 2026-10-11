import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppData, fullName } from "@/lib/store";
import { slotMembers, DAY_NAMES, weekStart, dateOfDay, weekSchedules } from "@/lib/schedule";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/app/agenda")({
  head: () =>
    pageHead("Agenda semanal", "Sesiones semanales y ocupación de las clases del centro."),
  component: Agenda,
});

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", o);

function Agenda() {
  const { data, settings } = useAppData();
  const [offset, setOffset] = useState(0);
  if (!data || !settings) return null;
  const days = settings.open_days;
  const times = [...settings.class_times].sort();
  const monday = weekStart(new Date(), offset);
  const todayIso = dateOfDay(
    weekStart(new Date()),
    ["D", "L", "M", "X", "J", "V", "S"][new Date().getDay()]!,
  );
  const members = weekSchedules(data.members, data.member_requests, monday);
  const first = dateOfDay(monday, days[0] ?? "L");
  const last = dateOfDay(monday, days[days.length - 1] ?? "V");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-3xl font-black uppercase">Agenda semanal</h1>
        <p className="text-xs text-muted-foreground">
          Aforo {settings.capacity} · <span className="text-success">verde</span> normal ·{" "}
          <span className="text-destructive">rojo</span> con solapamiento
        </p>
      </div>
      <div className="panel flex flex-wrap items-center gap-2">
        <button
          aria-label="Semana anterior"
          onClick={() => setOffset(offset - 1)}
          className="rounded-lg border p-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setOffset(0)}
          disabled={offset === 0}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Semana actual
        </button>
        <button
          aria-label="Semana siguiente"
          onClick={() => setOffset(offset + 1)}
          className="rounded-lg border p-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="font-display text-lg font-bold">
          {fmt(first, { day: "numeric", month: "short" })} –{" "}
          {fmt(last, { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <input
          type="date"
          aria-label="Ir a fecha"
          className="field ml-auto w-auto"
          onChange={(e) => {
            if (!e.target.value) return;
            const diff =
              weekStart(new Date(`${e.target.value}T12:00:00`)).getTime() -
              weekStart(new Date()).getTime();
            setOffset(Math.round(diff / (7 * 864e5)));
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[760px] gap-2"
          style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0,1fr))` }}
        >
          <div />
          {days.map((d) => {
            const iso = dateOfDay(monday, d);
            return (
              <div
                key={d}
                className={`text-center font-display text-lg font-bold uppercase ${iso === todayIso ? "text-primary" : ""}`}
              >
                {DAY_NAMES[d]}{" "}
                <span className="text-sm text-muted-foreground">
                  {fmt(iso, { day: "numeric" })}
                </span>
              </div>
            );
          })}
          {times.map((t) => (
            <div key={t} className="contents">
              <div className="pt-2 font-display text-lg font-bold text-muted-foreground">{t}</div>
              {days.map((d) => {
                const { regular, overlap, count } = slotMembers(members, d, t);
                const over = count > settings.capacity;
                return (
                  <div
                    key={d}
                    className={`panel min-h-20 p-2 ${over ? "border-destructive/60" : ""}`}
                  >
                    <div
                      className={`text-right font-display text-xl font-black ${over ? "text-destructive" : count ? "text-success" : "text-muted-foreground"}`}
                    >
                      {count}/{settings.capacity}
                    </div>
                    {regular.map((m) => (
                      <div key={m.id} className="truncate text-xs">
                        {fullName(m)}
                      </div>
                    ))}
                    {overlap.map((m) => (
                      <div key={m.id} className="truncate text-xs text-destructive">
                        {fullName(m)} · {m.schedule[d]}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
