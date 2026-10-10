import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ownerLoad, ownerMutate } from "./api.functions";

export interface Member {
  id: string; first_name: string; last_name: string; phone: string; pin: string;
  birth_date: string | null; join_date: string; active: boolean; plan_days: number;
  schedule: Record<string, string>; conditions: string[]; notes: string;
  consent: boolean; consent_date: string | null;
  recovery_sessions: number; recovery_notes: string;
}
export interface Payment { id: string; member_id: string; month: string; amount: number; method: string | null; paid: boolean; paid_at: string | null }
export interface Exercise { id: string; name: string; category: string }
export interface WorkoutItem { name: string; sets?: string; reps?: string; load?: string; recordedLoad?: string }
export interface WorkoutBlock { block: string; items: WorkoutItem[] }
export interface Workout { id: string; member_id: string; date: string; type: string; title: string; blocks: WorkoutBlock[] }
export interface Condition { id: string; name: string; kind: "lesion" | "patologia" | "condicion" | "objetivo" }
export interface MemberRequest { id: string; member_id: string; type: string; day: string | null; desired_time: string | null; message: string; status: string; created_at: string }
export interface Settings {
  owner_password: string; capacity: number; overlap_max: number; tariffs: Record<string, number>;
  open_days: string[]; class_times: string[]; payment_methods: string[]; exercise_categories: string[];
}
export interface AppData {
  members: Member[]; payments: Payment[]; exercises: Exercise[]; workouts: Workout[];
  conditions: Condition[]; member_requests: MemberRequest[]; settings: { id: number; data: Settings }[];
}
export type TableName = keyof AppData;

export const getPw = () => (typeof window === "undefined" ? "" : sessionStorage.getItem("owner_pw") ?? "");

export function useAppData() {
  const load = useServerFn(ownerLoad);
  const q = useQuery({ queryKey: ["app"], queryFn: () => load({ data: { password: getPw() } }) as Promise<AppData> });
  const settings = q.data?.settings?.[0]?.data;
  return { ...q, settings };
}

export function useMutate() {
  const fn = useServerFn(ownerMutate);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { table: TableName; action: "upsert" | "delete" | "deleteAll" | "insertMany"; rows?: any[]; id?: string; onConflict?: string }) =>
      fn({ data: { password: getPw(), ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const monthLabel = (m: string) => {
  const [y = 2000, mo = 1] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
};
export const lastMonths = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(currentMonth(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  return out;
};
export const age = (b: string | null) => {
  if (!b) return null;
  const d = new Date(b), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};
export const fee = (m: Member, s?: Settings) => s?.tariffs?.[String(m.plan_days)] ?? 0;
export const fullName = (m: Member) => `${m.first_name} ${m.last_name}`.trim();
export const KIND_LABEL: Record<string, string> = { lesion: "Lesión", patologia: "Patología", condicion: "Condición", objetivo: "Objetivo" };
