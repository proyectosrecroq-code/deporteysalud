// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RateLimitError,
  assertNotLocked,
  clearAttempts,
  consumeAttempt,
  fingerprint,
  hashPassword,
  memoryStore,
  randomPin,
  recordFailure,
  signSession,
  verifyPassword,
  verifySession,
} from "@/lib/auth-core.server";

const rule = { max: 3, windowMs: 60_000, lockMs: 120_000 };

describe("contraseña del propietario", () => {
  it("guarda un hash con sal y solo valida la contraseña correcta", async () => {
    const hash = await hashPassword("una-contraseña-larga");
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(hash).not.toContain("una-contraseña-larga");
    expect(await verifyPassword("una-contraseña-larga", hash)).toBe(true);
    expect(await verifyPassword("otra-contraseña-larga", hash)).toBe(false);
    expect(await hashPassword("una-contraseña-larga")).not.toBe(hash);
  });
  it("rechaza hashes mal formados sin lanzar", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$abc$$")).toBe(false);
    expect(await verifyPassword("x", "md5$1$a$b")).toBe(false);
  });
});

describe("sesión firmada", () => {
  const secret = "service-role-key-de-prueba";
  it("acepta un token válido y rechaza manipulado, caducado o de otro secreto", async () => {
    const ph = await fingerprint("hash-1");
    const token = await signSession({ exp: Date.now() + 60_000, ph }, secret);
    expect((await verifySession(token, secret))?.ph).toBe(ph);
    expect(await verifySession(token, "otro-secreto")).toBeNull();
    const [body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ exp: Date.now() + 9e9, ph })).replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`, secret)).toBeNull();
    expect(await verifySession(`${body}.${sig}x`, secret)).toBeNull();
    expect(await verifySession("abc", secret)).toBeNull();
    expect(await verifySession("", secret)).toBeNull();
    const expired = await signSession({ exp: Date.now() - 1, ph }, secret);
    expect(await verifySession(expired, secret)).toBeNull();
  });
  it("la huella cambia con el hash: cambiar la contraseña invalida las sesiones", async () => {
    expect(await fingerprint("hash-1")).not.toBe(await fingerprint("hash-2"));
  });
});

describe("PIN aleatorio", () => {
  it("tiene la longitud pedida, solo dígitos y reparte los 10 dígitos", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const pin = randomPin(6);
      expect(pin).toMatch(/^\d{6}$/);
      for (const c of pin) seen.add(c);
    }
    expect(seen.size).toBe(10);
  });
});

describe("límite de intentos", () => {
  it("bloquea al superar el máximo y avisa del tiempo restante", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await consumeAttempt(store, "k", rule);
    await expect(consumeAttempt(store, "k", rule)).rejects.toBeInstanceOf(RateLimitError);
    await expect(consumeAttempt(store, "k", rule)).rejects.toThrow(/Inténtalo de nuevo en 2 min/);
    await consumeAttempt(store, "otra-clave", rule);
  });
  it("una ráfaga de intentos en paralelo no puede superar el máximo", async () => {
    const store = memoryStore();
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () => consumeAttempt(store, "k", rule)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });
  it("el acierto reinicia el contador", async () => {
    const store = memoryStore();
    await consumeAttempt(store, "k", rule);
    await consumeAttempt(store, "k", rule);
    await clearAttempts(store, "k");
    for (let i = 0; i < 3; i++) await consumeAttempt(store, "k", rule);
  });
  it("los contadores solo de fallos bloquean al llegar al máximo", async () => {
    const store = memoryStore();
    await recordFailure(store, "ip", rule);
    await recordFailure(store, "ip", rule);
    await assertNotLocked(store, "ip");
    await recordFailure(store, "ip", rule);
    await expect(assertNotLocked(store, "ip")).rejects.toBeInstanceOf(RateLimitError);
  });
  it("el bloqueo caduca", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await consumeAttempt(store, "k", rule);
    await expect(consumeAttempt(store, "k", rule)).rejects.toBeInstanceOf(RateLimitError);
    store.state.entries["k"]!.reset = Date.now() - 1;
    await consumeAttempt(store, "k", rule);
  });
  it("con contención extrema falla cerrado en vez de dejar pasar", async () => {
    const store = { load: async () => ({ rev: 0, entries: {} }), swap: async () => false };
    await expect(consumeAttempt(store, "k", rule)).rejects.toBeInstanceOf(RateLimitError);
  });
});
