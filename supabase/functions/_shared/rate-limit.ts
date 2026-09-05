/**
 * Limite de tentativas persistente (tabela auth_rate_limits), janela horária.
 * Usado pelos passos de login e de recuperação de senha.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** IP do chamador (proxy-aware). */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Incrementa e verifica o contador. Retorna true quando o chamador já passou
 * do limite na janela atual.
 */
export async function isRateLimited(
  admin: SupabaseClient,
  bucket: string,
  keyHash: string,
  max: number,
): Promise<boolean> {
  const now = new Date();
  const hour = 60 * 60 * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / hour) * hour).toISOString();

  const { data: existing } = await admin
    .from("auth_rate_limits")
    .select("count")
    .eq("bucket", bucket)
    .eq("key_hash", keyHash)
    .eq("window_start", windowStart)
    .maybeSingle();

  const nextCount = (existing?.count ?? 0) + 1;
  await admin.from("auth_rate_limits").upsert(
    {
      bucket,
      key_hash: keyHash,
      window_start: windowStart,
      count: nextCount,
      last_seen_at: now.toISOString(),
    },
    { onConflict: "bucket,key_hash,window_start" },
  );
  return nextCount > max;
}

/** Limite por IP para um passo específico. */
export async function ipRateLimited(
  admin: SupabaseClient,
  req: Request,
  bucket: string,
  max: number,
): Promise<boolean> {
  const keyHash = await sha256Hex(`${bucket}:ip:${clientIp(req)}`);
  return await isRateLimited(admin, bucket, keyHash, max);
}
