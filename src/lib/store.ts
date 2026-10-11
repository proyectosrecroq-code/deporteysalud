import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ownerLoad, ownerMutate } from "./api.functions";
import { isAuthError } from "./auth-errors";

export interface Member {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  pin: string;
  birth_date: string | null;
  join_date: string;
  active: boolean;
  plan_days: number;
  schedule: Record<string, string>;
  conditions: string[];
  notes: string;
  consent: boolean;
  consent_date: string | null;
  recovery_sessions: number;
  recovery_notes: string;
}
export interface Payment {
  id: string;
  member_id: string;
  month: string;
  amount: number;
  method: string | null;
  paid: boolean;
  paid_at: string | null;
}
export interface Exercise {
  id: string;
  name: string;
  category: string;
}
export interface WorkoutItem {
  name: string;
  sets?: string;
  reps?: string;
  load?: string;
  recordedLoad?: string;
}
export interface WorkoutBlock {
  block: string;
  items: WorkoutItem[];
}
export interface Workout {
  id: string;
  member_id: string;
  date: string;
  type: string;
  title: string;
  blocks: WorkoutBlock[];
}
export interface Condition {
  id: string;
  name: string;
  kind: "lesion" | "patologia" | "condicion" | "objetivo";
}
export interface MemberRequest {
  id: string;
  member_id: string;
  type: string;
  day: string | null;
  desired_time: string | null;
  message: string;
  status: string;
  created_at: string;
}
export interface Settings {
  capacity: number;
  overlap_max: number;
  tariffs: Record<string, number>;
  open_days: string[];
  class_times: string[];
  payment_methods: string[];
  exercise_categories: string[];
}
export interface AppData {
  members: Member[];
  payments: Payment[];
  exercises: Exercise[];
  workouts: Workout[];
  conditions: Condition[];
  member_requests: MemberRequest[];
  settings: { id: number; data: Settings }[];
}
export type TableName = Exclude<keyof AppData, "settings">;

// Session: a signed token issued by the server after login. The password itself is never stored.
const TOKEN_KEY = "owner_token";
const EXPIRES_KEY = "owner_expires";

export function saveSession(session: { token: string; expiresAt: number }) {
  sessionStorage.setItem(TOKEN_KEY, session.token);
  sessionStorage.setItem(EXPIRES_KEY, String(session.expiresAt));
}
export function clearSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
    sessionStorage.removeItem("owner_ok");
    sessionStorage.removeItem("owner_pw");
  } catch {
    /* storage unavailable */
  }
}
export function getToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expires = Number(sessionStorage.getItem(EXPIRES_KEY));
    if (token && expires > Date.now()) return token;
    clearSession();
  } catch {
    /* storage unavailable */
  }
  return "";
}

/** Session expired or revoked (for example after a password change): back to the login screen. */
export function handleAuthError() {
  clearSession();
  toast.error("Tu sesión ha caducado. Inicia sesión de nuevo.");
  setTimeout(() => window.location.assign("/"), 900);
}

export function useAppData() {
  const load = useServerFn(ownerLoad);
  const q = useQuery({
    queryKey: ["app"],
    queryFn: () => load({ data: { token: getToken() } }) as unknown as Promise<AppData>,
    retry: (count, error) => !isAuthError(error) && count < 2,
  });
  const settings = q.data?.settings?.[0]?.data;
  return { ...q, settings };
}

export function useMutate() {
  const fn = useServerFn(ownerMutate);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      table: TableName;
      action: "upsert" | "delete" | "deleteAll" | "insertMany";
      rows?: object[];
      id?: string;
      onConflict?: "member_id,month";
    }) =>
      fn({
        data: {
          token: getToken(),
          table: v.table,
          action: v.action,
          ...(v.rows ? { rows: v.rows as Record<string, unknown>[] } : {}),
          ...(v.id ? { id: v.id } : {}),
          ...(v.onConflict ? { onConflict: v.onConflict } : {}),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app"] }),
    onError: (e: Error) => (isAuthError(e) ? handleAuthError() : toast.error(e.message)),
  });
}

export const currentMonth = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const monthLabel = (m: string) => {
  const [y = 2000, mo = 1] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
};
export const lastMonths = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--)
    out.push(currentMonth(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  return out;
};
export const age = (b: string | null) => {
  if (!b) return null;
  const d = new Date(b),
    n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};
export const fee = (m: Member, s?: Settings) => s?.tariffs?.[String(m.plan_days)] ?? 0;
export const fullName = (m: Member) => `${m.first_name} ${m.last_name}`.trim();
export const KIND_LABEL: Record<string, string> = {
  lesion: "Lesión",
  patologia: "Patología",
  condicion: "Condición",
  objetivo: "Objetivo",
};
