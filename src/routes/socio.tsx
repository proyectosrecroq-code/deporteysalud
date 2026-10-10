import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { memberPortal, memberRequest } from "@/lib/api.functions";
import { DAY_NAMES } from "@/lib/schedule";

export const Route = createFileRoute("/socio")({
  head: () => ({
    meta: [
      { title: "Área de socios — Centro Deportivo Funcional" },
      { name: "description", content: "Consulta tus sesiones de la semana y avisa de cambios o ausencias." },
      { property: "og:title", content: "Área de socios — Centro Deportivo Funcional" },
      { property: "og:description", content: "Consulta tus sesiones de la semana y avisa de cambios o ausencias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SocioPage,
});

type Portal = Awaited<ReturnType<typeof memberPortal>>;

function SocioPage() {
  const portal = useServerFn(memberPortal);
  const request = useServerFn(memberRequest);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [data, setData] = useState<Portal | null>(null);
  const [form, setForm] = useState({ type: "cambio" as "cambio" | "ausencia", day: "L", desired_time: "", message: "" });

  const load = async () => {
    try { setData(await portal({ data: { phone, pin } })); } catch (e) { toast.error((e as Error).message); }
  };
  const send = async () => {
    try {
      await request({ data: { phone, pin, ...form, desired_time: form.desired_time || undefined } });
      toast.success("Aviso enviado al centro");
      setForm({ ...form, message: "", desired_time: "" });
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-6 p-5">
      <div className="flex items-center justify-between">
        <Logo size="sm" />
        <Link to="/" className="text-sm text-muted-foreground">Salir</Link>
      </div>
      {!data ? (
        <div className="panel space-y-3">
          <h1 className="text-2xl font-extrabold uppercase">Acceso socios</h1>
          <input className="field" inputMode="tel" placeholder="Número de teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="field" inputMode="numeric" type="password" placeholder="PIN (te lo da el centro)" value={pin} onChange={(e) => setPin(e.target.value)} />
          <button onClick={load} className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground">Ver mis sesiones</button>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-extrabold uppercase">Hola, <span className="text-primary">{data.name}</span></h1>
          <section className="space-y-2">
            <h2 className="text-lg font-bold uppercase text-muted-foreground">Tus sesiones esta semana</h2>
            {data.sessions.length === 0 && <p className="text-sm text-muted-foreground">No tienes sesiones asignadas.</p>}
            {data.sessions.map((s) => (
              <div key={s.day} className="panel">
                <div className="flex justify-between font-display text-xl font-bold"><span>{DAY_NAMES[s.day]}</span><span className="text-primary">{s.time}</span></div>
                <p className="mt-1 text-sm text-muted-foreground">Con: {s.mates.length ? s.mates.join(", ") : "nadie más por ahora"}</p>
              </div>
            ))}
          </section>
          <section className="panel space-y-3">
            <h2 className="text-lg font-bold uppercase">Avisar al centro</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "cambio" })}>
                <option value="cambio">Cambio de hora</option><option value="ausencia">No puedo acudir</option>
              </select>
              <select className="field" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                {["L", "M", "X", "J", "V"].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
              </select>
            </div>
            {form.type === "cambio" && <input className="field" type="time" step={1800} value={form.desired_time} onChange={(e) => setForm({ ...form, desired_time: e.target.value })} />}
            <textarea className="field" rows={3} placeholder="Motivo" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            <button onClick={send} disabled={!form.message.trim()} className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-50">Enviar</button>
          </section>
          {data.requests.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold uppercase text-muted-foreground">Mis avisos</h2>
              {data.requests.map((r: any) => (
                <div key={r.id} className="panel flex justify-between text-sm">
                  <span>{r.type === "cambio" ? "Cambio" : "Ausencia"} · {DAY_NAMES[r.day] ?? ""} {r.desired_time ?? ""}</span>
                  <span className={r.status === "aprobado" ? "text-success" : r.status === "rechazado" ? "text-destructive" : "text-warning"}>{r.status}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
