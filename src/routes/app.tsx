import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import {
  Home,
  Users,
  CalendarDays,
  Dumbbell,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { clearSession, getToken, handleAuthError, useAppData } from "@/lib/store";
import { isAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Panel — Deporte y Salud" },
      { name: "description", content: "Panel de gestión del centro deportivo Deporte y Salud." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Panel — Deporte y Salud" },
      {
        property: "og:description",
        content: "Panel de gestión del centro deportivo Deporte y Salud.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppLayout,
});

const TABS = [
  { to: "/app", label: "Inicio", icon: Home, exact: true },
  { to: "/app/socios", label: "Socios", icon: Users },
  { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/app/entrenos", label: "Entrenos", icon: Dumbbell },
  { to: "/app/finanzas", label: "Finanzas", icon: Wallet },
  { to: "/app/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/app/ajustes", label: "Ajustes", icon: Settings },
] as const;

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

function AppLayout() {
  const nav = useNavigate();
  const { isLoading, error } = useAppData();
  const online = useOnline();
  useEffect(() => {
    if (isAuthError(error)) handleAuthError();
  }, [error]);
  const exit = () => {
    clearSession();
    nav({ to: "/" });
  };
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Logo size="sm" />
          <nav className="hidden flex-1 gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: "exact" in t }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-accent !text-accent-foreground font-semibold" }}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={exit}
            className="ml-auto flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-background/95 py-1 md:hidden">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: "exact" in t }}
            className="flex flex-col items-center gap-0.5 px-1 py-1 text-[10px] text-muted-foreground"
            activeProps={{ className: "!text-primary" }}
          >
            <t.icon className="h-5 w-5" />
            {t.label}
          </Link>
        ))}
      </nav>
      {!online && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-warning/20 px-4 py-2 text-sm text-warning"
        >
          <WifiOff className="h-4 w-4" />
          Sin conexión: los datos de socios no se guardan en este dispositivo, necesitas internet
          para verlos y editarlos.
        </div>
      )}
      <main className="mx-auto max-w-7xl p-4">
        {error ? (
          <p className="text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
