import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TABLES = ["members", "payments", "exercises", "workouts", "conditions", "member_requests", "settings"] as const;
type Table = (typeof TABLES)[number];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function verifyOwner(password: string) {
  const db = await admin();
  const { data } = await db.from("settings").select("data").eq("id", 1).single();
  const pw = (data?.data?.owner_password as string) || "";
  if (pw && pw !== password) throw new Error("Contraseña incorrecta");
  return db;
}

export const ownerLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    await verifyOwner(data.password);
    return { ok: true };
  });

export const ownerLoad = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.password);
    const out: Record<string, any[]> = {};
    for (const t of TABLES) {
      const { data: rows, error } = await db.from(t).select("*").limit(5000);
      if (error) throw new Error(error.message);
      out[t] = rows ?? [];
    }
    return out as Record<Table, any[]>;
  });

export const ownerMutate = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      password: z.string().max(100),
      table: z.enum(TABLES),
      action: z.enum(["upsert", "delete", "deleteAll", "insertMany"]),
      rows: z.array(z.record(z.string(), z.any())).max(5000).optional(),
      id: z.string().optional(),
      onConflict: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.password);
    const q = db.from(data.table);
    let res;
    if (data.action === "upsert")
      res = await q.upsert(data.rows ?? [], data.onConflict ? { onConflict: data.onConflict } : undefined).select();
    else if (data.action === "insertMany") res = await q.insert(data.rows ?? []).select();
    else if (data.action === "delete") res = await q.delete().eq("id", data.id);
    else res = await q.delete().not("id", "is", null);
    if (res.error) throw new Error(res.error.message);
    return { rows: res.data ?? [] };
  });

export const ownerRestore = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().max(100), backup: z.record(z.string(), z.array(z.any())) }).parse(d))
  .handler(async ({ data }) => {
    const db = await verifyOwner(data.password);
    for (const t of ["member_requests", "workouts", "payments", "members", "exercises", "conditions"] as Table[])
      await db.from(t).delete().not("id", "is", null);
    for (const t of ["members", "payments", "workouts", "member_requests", "exercises", "conditions", "settings"] as Table[]) {
      const rows = data.backup[t];
      if (rows?.length) {
        const { error } = await db.from(t).upsert(rows);
        if (error) throw new Error(`${t}: ${error.message}`);
      }
    }
    return { ok: true };
  });

const memberCreds = z.object({ phone: z.string().trim().min(6).max(20), pin: z.string().trim().min(4).max(8) });

async function findMember(phone: string, pin: string) {
  const db = await admin();
  const { data } = await db.from("members").select("id, first_name, schedule, active, pin").eq("phone", phone).maybeSingle();
  if (!data || data.pin !== pin) throw new Error("Teléfono o PIN incorrectos");
  return { db, member: data };
}

export const memberPortal = createServerFn({ method: "POST" })
  .inputValidator((d) => memberCreds.parse(d))
  .handler(async ({ data }) => {
    const { db, member } = await findMember(data.phone, data.pin);
    const { data: all } = await db.from("members").select("id, first_name, schedule, active").eq("active", true);
    const { toMin } = await import("./schedule");
    const sessions = Object.entries((member.schedule ?? {}) as Record<string, string>).map(([day, time]) => {
      const t = toMin(time);
      const mates = (all ?? [])
        .filter((o: any) => o.id !== member.id && o.schedule?.[day] && Math.abs(toMin(o.schedule[day]) - t) < 60)
        .map((o: any) => o.first_name as string); // solo nombre (protección de datos)
      return { day, time, mates };
    });
    const { data: reqs } = await db.from("member_requests").select("id,type,day,desired_time,message,status,created_at")
      .eq("member_id", member.id).order("created_at", { ascending: false }).limit(10);
    return { name: member.first_name as string, sessions, requests: reqs ?? [] };
  });

export const memberRequest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    memberCreds.extend({
      type: z.enum(["cambio", "ausencia"]),
      day: z.string().max(2),
      desired_time: z.string().max(5).optional(),
      message: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db, member } = await findMember(data.phone, data.pin);
    const { error } = await db.from("member_requests").insert({
      member_id: member.id, type: data.type, day: data.day, desired_time: data.desired_time ?? null, message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
