import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Crear cuenta o entrar — Centro Deportivo Funcional" },
      { name: "description", content: "Crea tu cuenta o entra con tu email y contraseña." },
      { property: "og:title", content: "Crear cuenta o entrar — Centro Deportivo Funcional" },
      { property: "og:description", content: "Crea tu cuenta o entra con tu email y contraseña." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setConfirmSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        sessionStorage.setItem("owner_ok", "1");
        nav({ to: "/app" });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <Logo size="lg" />
        {confirmSent ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">Revisa tu correo</p>
            <p className="text-sm text-muted-foreground">
              Te hemos enviado un enlace de confirmación a <span className="text-foreground">{email}</span>. Pulsa el enlace para activar tu cuenta y después entra aquí.
            </p>
            <Button variant="ghost" onClick={() => { setConfirmSent(false); setMode("signin"); }}>
              Volver a entrar
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              {mode === "signin" ? "Entra con tu cuenta" : "Crea tu cuenta"}
            </p>
            <div className="space-y-3">
              <input type="email" className="field text-center" placeholder="Email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <input type="password" className="field text-center" placeholder="Contraseña" value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
                autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              <button onClick={submit} disabled={loading || !email || !password}
                className="glow w-full rounded-lg bg-primary py-3 font-display text-xl font-extrabold uppercase text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {mode === "signin" ? "Entrar" : "Registrarme"}
              </button>
            </div>
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm text-muted-foreground hover:text-foreground">
              {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
            </button>
          </>
        )}
        <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground">
          ← Volver al acceso con contraseña
        </Link>
      </div>
    </main>
  );
}
