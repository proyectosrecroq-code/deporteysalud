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
      { title: "Área de socios — Deporte y Salud" },
      { name: "description", content: "Consulta tus sesiones de la semana y avisa de cambios o ausencias." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Área de socios — Deporte y Salud" },
      { property: "og:description", content: "Consulta tus sesiones de la semana y avisa de cambios o ausencias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SocioPage,
});

type Portal = Awaited<ReturnType<typeof memberPortal>>;
interface PortalRequest {
  id: string;
  type: string;
  day: string | null;
  desired_time: string | null;
  status: string;
}

function SocioPage() {
  const portal = useServerFn(memberPortal);
  const request = useServerFn(memberRequest);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [data, setData] = useState<Portal | null>(null);
  const [form, setForm] = useState({ type: "cambio" as "cambio" | "ausencia", day: "L", desired_time: "", message: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const result = await portal({ data: { phone, pin } });
      setData(result);
      const first = result.sessions[0]?.day;
      if (first) setForm((f) => (result.sessions.some((s) => s.day === f.day) ? f : { ...f, day: first }));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      await request({
        data: {
          phone, pin, type: form.type, day: form.day as "L" | "M" | "X" | "J" | "V", message: form.message,
          ...(form.type === "cambio" && form.desired_time ? { desired_time: form.desired_time } : {}),
        },
      });
      toast.success("Aviso enviado al centro");
      setForm({ ...form, message: "", desired_time: "" });
      await load();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  const leave = () => { setData(null); setPhone(""); setPin(""); };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-6 p-5">
      <div className="flex items-center justify-between">
        <Logo size="sm" />
        <Link to="/" onClick={leave} className="text-sm text-muted-foreground">Salir</Link>
      </div>
      {!data ? (
        <div className="panel space-y-3">
          <h1 className="text-2xl font-extrabold uppercase">Acceso socios</h1>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void load(); }}>
            <input className="field" inputMode="tel" autoComplete="tel" aria-label="Número de teléfono" placeholder="Número de teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="field" inputMode="numeric" type="password" maxLength={8} autoComplete="one-time-code" aria-label="PIN" placeholder="PIN (te lo da el centro)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <button type="submit" disabled={busy || phone.trim().length < 6 || pin.length < 4} className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-50">Ver mis sesiones</button>
          </form>
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
                {data.sessions.map((x) => <option key={x.day} value={x.day}>{DAY_NAMES[x.day]}</option>)}
              </select>
            </div>
            {form.type === "cambio" && (
              <select className="field" aria-label="Hora que prefieres" value={form.desired_time} onChange={(e) => setForm({ ...form, desired_time: e.target.value })}>
                <option value="">Hora que prefieres…</option>
                {data.times.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <textarea className="field" rows={3} maxLength={500} placeholder="Motivo" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            <button onClick={() => void send()} disabled={busy || !form.message.trim() || (form.type === "cambio" && !form.desired_time) || data.sessions.length === 0} className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-50">Enviar</button>
          </section>
          {data.requests.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold uppercase text-muted-foreground">Mis avisos</h2>
              {(data.requests as unknown as PortalRequest[]).map((r) => (
                <div key={r.id} className="panel flex justify-between text-sm">
                  <span>{r.type === "cambio" ? "Cambio" : "Ausencia"} · {DAY_NAMES[r.day ?? ""] ?? ""} {r.desired_time ?? ""}</span>
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
