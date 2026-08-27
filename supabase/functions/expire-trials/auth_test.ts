// Regression tests for the expire-trials authorization gate (P0):
// a forged JWT claiming role=service_role must NOT be accepted.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SERVICE_KEY = "real-service-role-key-value";
const CRON_SECRET = "cron-shared-secret";

function authorize(bearer: string, cronSecret: string): boolean {
  const isServiceRoleKey = timingSafeEqual(bearer, SERVICE_KEY);
  const isCron = CRON_SECRET.length > 0 && timingSafeEqual(cronSecret, CRON_SECRET);
  return isServiceRoleKey || isCron;
}

function forgedServiceRoleJwt(): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64({ role: "service_role" })}.forged`;
}

Deno.test("forged service_role JWT is rejected", () => {
  assertEquals(authorize(forgedServiceRoleJwt(), ""), false);
});

Deno.test("empty credentials are rejected", () => {
  assertEquals(authorize("", ""), false);
});

Deno.test("wrong cron secret is rejected", () => {
  assertEquals(authorize("", "nope"), false);
});

Deno.test("exact service role key is accepted", () => {
  assertEquals(authorize(SERVICE_KEY, ""), true);
});

Deno.test("exact cron secret is accepted", () => {
  assertEquals(authorize("", CRON_SECRET), true);
});
