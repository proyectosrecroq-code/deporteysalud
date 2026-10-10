import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Logo, LOGO_URL } from "@/components/Logo";
import { ownerLogin } from "@/lib/api.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Centro Deportivo Funcional — Acceso" },
      { name: "description", content: "Gestión de socios, agenda, entrenos y finanzas del centro deportivo funcional." },
      { property: "og:title", content: "Centro Deportivo Funcional — Acceso" },
      { property: "og:description", content: "Gestión de socios, agenda, entrenos y finanzas del centro deportivo funcional." },
    ],
  }),
  component: Index,
});

const WORDS = ["REMO", "AIRBIKE", "KETTLEBELL", "WALL BALLS", "SLED", "BURPEES", "SKIERG", "DEADLIFT"];

function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= WORDS.length) { const t = setTimeout(onDone, 2700); return () => clearTimeout(t); }
    const t = setTimeout(() => setI(i + 1), 900);
    return () => clearTimeout(t);
  }, [i, onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-24 overflow-hidden"><div className="h-full w-1/2 bg-primary animate-sweep" /></div>
      <div className="absolute inset-x-0 top-1/2 h-1 translate-y-24 overflow-hidden"><div className="h-full w-1/2 bg-primary animate-sweep" /></div>
      {i < WORDS.length ? (
        <h1 key={i} className="animate-flash font-display text-6xl font-black italic text-primary md:text-9xl">{WORDS[i]}</h1>
      ) : (
        <img src={LOGO_URL} alt="Logo" className="animate-spin-y-fade h-56 w-56 rounded-2xl object-contain md:h-72 md:w-72" />
      )}
      <button onClick={onDone} className="absolute bottom-6 right-6 rounded-full border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground">Saltar</button>
    </div>
  );
}

function Index() {
  const nav = useNavigate();
  const login = useServerFn(ownerLogin);
  const [intro, setIntro] = useState(false);
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!sessionStorage.getItem("intro_seen")) setIntro(true); }, []);
  const done = () => { sessionStorage.setItem("intro_seen", "1"); setIntro(false); };

  const enter = async () => {
    setLoading(true);
    try {
      await login({ data: { password: pw } });
      sessionStorage.setItem("owner_pw", pw);
      sessionStorage.setItem("owner_ok", "1");
      nav({ to: "/app" });
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {intro && <Intro onDone={done} />}
      <div className="w-full max-w-sm space-y-8 text-center">
        <Logo size="lg" />
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Centro deportivo</p>
        <div className="space-y-3">
          <input type="password" className="field text-center" placeholder="Contraseña" value={pw}
            onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enter()} />
          <button onClick={enter} disabled={loading}
            className="glow w-full rounded-lg bg-primary py-3 font-display text-xl font-extrabold uppercase text-primary-foreground transition hover:brightness-110">
            Entrar
          </button>
        </div>
        <button onClick={() => nav({ to: "/socio" })} className="w-full rounded-lg border border-primary/40 py-3 text-sm hover:bg-accent">
          ¿Eres socio? <span className="font-semibold text-primary">Entra aquí</span>
        </button>
      </div>
    </main>
  );
}
