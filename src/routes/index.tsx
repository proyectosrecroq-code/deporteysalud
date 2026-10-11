import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Intro } from "@/components/Intro";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { ownerLogin, ownerSetup, ownerStatus } from "@/lib/api.functions";
import { saveSession } from "@/lib/store";
import { PASSWORD_MIN } from "@/lib/validation";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deporte y Salud — Acceso" },
      {
        name: "description",
        content:
          "Gestión de socios, agenda, entrenos y finanzas del centro deportivo Deporte y Salud.",
      },
      { property: "og:title", content: "Deporte y Salud — Acceso" },
      {
        property: "og:description",
        content:
          "Gestión de socios, agenda, entrenos y finanzas del centro deportivo Deporte y Salud.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  const login = useServerFn(ownerLogin);
  const setup = useServerFn(ownerSetup);
  const status = useServerFn(ownerStatus);
  const [intro, setIntro] = useState(true);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  /** null while we ask the server whether a password already exists. */
  const [configured, setConfigured] = useState<boolean | null>(null);
  const done = useCallback(() => setIntro(false), []);

  useEffect(() => {
    status()
      .then((r) => setConfigured(r.configured))
      .catch(() => setConfigured(true));
  }, [status]);

  const enter = async () => {
    if (configured === false) {
      if (pw.length < PASSWORD_MIN)
        return void toast.error(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
      if (pw !== pw2) return void toast.error("Las contraseñas no coinciden");
    }
    setLoading(true);
    try {
      const session =
        configured === false
          ? await setup({ data: { password: pw } })
          : await login({ data: { password: pw } });
      saveSession(session);
      if ("weak" in session && session.weak)
        toast.warning(
          `Tu contraseña tiene menos de ${PASSWORD_MIN} caracteres: cámbiala en Ajustes.`,
          { duration: 10000 },
        );
      if (configured === false)
        toast.success("Contraseña creada. Guárdala: no se puede recuperar desde la app.", {
          duration: 10000,
        });
      nav({ to: "/app" });
    } catch (e) {
      toast.error((e as Error).message);
      // Somebody else may have created the password first: go back to the login form.
      if ((e as Error).message.includes("ya está configurada")) setConfigured(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {intro && <Intro onDone={done} />}
      {!intro && (
        <div className="w-full max-w-sm space-y-8 text-center">
          <Logo size="lg" />
          <Button variant="ghost" size="sm" onClick={() => setIntro(true)}>
            <RotateCcw />
            Ver presentación
          </Button>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Centro deportivo
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
          >
            {configured === false && (
              <p className="rounded-lg border border-primary/40 p-3 text-left text-sm text-muted-foreground">
                Primer acceso: crea la contraseña del propietario (mínimo {PASSWORD_MIN}{" "}
                caracteres). Es la única forma de entrar al panel.
              </p>
            )}
            <input
              type="password"
              className="field text-center"
              placeholder={configured === false ? "Nueva contraseña" : "Contraseña"}
              aria-label="Contraseña"
              autoComplete={configured === false ? "new-password" : "current-password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            {configured === false && (
              <input
                type="password"
                className="field text-center"
                placeholder="Repite la contraseña"
                aria-label="Repite la contraseña"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            )}
            <button
              type="submit"
              disabled={loading || configured === null}
              className="glow w-full rounded-lg bg-primary py-3 font-display text-xl font-extrabold uppercase text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {configured === false ? "Crear y entrar" : "Entrar"}
            </button>
          </form>
          <button
            onClick={() => nav({ to: "/socio" })}
            className="w-full rounded-lg border border-primary/40 py-3 text-sm hover:bg-accent"
          >
            ¿Eres socio? <span className="font-semibold text-primary">Entra aquí</span>
          </button>
        </div>
      )}
    </main>
  );
}
