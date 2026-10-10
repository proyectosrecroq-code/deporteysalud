import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Intro } from "@/components/Intro";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { ownerLogin } from "@/lib/api.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deporte y Salud — Acceso" },
      { name: "description", content: "Gestión de socios, agenda, entrenos y finanzas del centro deportivo Deporte y Salud." },
      { property: "og:title", content: "Deporte y Salud — Acceso" },
      { property: "og:description", content: "Gestión de socios, agenda, entrenos y finanzas del centro deportivo Deporte y Salud." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  const login = useServerFn(ownerLogin);
  const [intro, setIntro] = useState(true);
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const done = useCallback(() => setIntro(false), []);

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
      {!intro && <div className="w-full max-w-sm space-y-8 text-center">
        <Logo size="lg" />
        <Button variant="ghost" size="sm" onClick={() => setIntro(true)}><RotateCcw />Ver presentación</Button>
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
      </div>}
    </main>
  );
}
