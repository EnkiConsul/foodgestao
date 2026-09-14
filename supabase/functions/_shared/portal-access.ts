/**
 * Códigos de ativação e redefinição do Portal do Colaborador.
 *
 * O gestor nunca conhece a senha: ele libera o acesso e entrega um link de uso
 * único. O banco guarda apenas a impressão digital (hash) do código — nunca o
 * código em si, nunca a senha. Nada disso vai para log.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Purpose = "activation" | "reset";

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L). */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Validade: ativação 24h, redefinição 30 min. */
const VALIDADE_MINUTOS: Record<Purpose, number> = { activation: 24 * 60, reset: 30 };

export function gerarCodigo(tamanho = 24): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALFABETO[b % ALFABETO.length];
  return out;
}

export async function hashCodigo(userId: string, codigo: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${codigo}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface EmitirInput {
  userId: string;
  colaboradorId: string;
  companyId: string;
  purpose: Purpose;
  createdBy: string | null;
}

export interface EmitirResult {
  tokenId: string;
  codigo: string;
  expiresAt: string;
}

/**
 * Emite um código novo e invalida os pendentes da mesma finalidade — só existe
 * um código válido por vez.
 */
export async function emitirToken(
  admin: SupabaseClient,
  input: EmitirInput,
): Promise<EmitirResult> {
  const agora = new Date();
  await admin
    .from("dp_portal_access_tokens")
    .update({ consumed_at: agora.toISOString() })
    .eq("user_id", input.userId)
    .eq("purpose", input.purpose)
    .is("consumed_at", null);

  const codigo = gerarCodigo();
  const expiresAt = new Date(
    agora.getTime() + VALIDADE_MINUTOS[input.purpose] * 60_000,
  ).toISOString();

  const { data, error } = await admin
    .from("dp_portal_access_tokens")
    .insert({
      user_id: input.userId,
      colaborador_id: input.colaboradorId,
      company_id: input.companyId,
      token_hash: await hashCodigo(input.userId, codigo),
      purpose: input.purpose,
      expires_at: expiresAt,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`token_insert: ${error?.message ?? "sem id"}`);

  return { tokenId: data.id as string, codigo, expiresAt };
}

export interface TokenValido {
  id: string;
  user_id: string;
  colaborador_id: string;
  company_id: string;
  purpose: Purpose;
}

/**
 * Reserva o código para uso exclusivo por alguns instantes.
 *
 * A identidade autorizada sai do próprio registro do código (nunca de algo
 * informado pelo navegador). Dois pedidos simultâneos não conseguem reservar o
 * mesmo código, e a reserva expira sozinha se o pedido morrer no meio.
 */
export async function reservarToken(
  admin: SupabaseClient,
  tokenId: string,
  codigo: string,
  purpose: Purpose,
): Promise<TokenValido | null> {
  if (!/^[0-9a-f-]{36}$/i.test(tokenId)) return null;

  // O hash inclui o usuário do código: buscamos o dono antes de conferir o segredo.
  const { data: dono, error: donoErr } = await admin
    .from("dp_portal_access_tokens")
    .select("user_id")
    .eq("id", tokenId)
    .maybeSingle();
  if (donoErr) throw new Error(`token_lookup: ${donoErr.message}`);
  if (!dono?.user_id) return null;

  const hash = await hashCodigo(dono.user_id as string, codigo);
  const { data, error } = await admin.rpc("dp_portal_token_claim", {
    p_token_id: tokenId,
    p_token_hash: hash,
    p_purpose: purpose,
  });
  if (error) throw new Error(`token_claim: ${error.message}`);
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.user_id) return null;
  return {
    id: tokenId,
    user_id: linha.user_id as string,
    colaborador_id: linha.colaborador_id as string,
    company_id: linha.company_id as string,
    purpose: linha.purpose as Purpose,
  };
}

/** Marca o código como usado — só depois que a senha realmente mudou. */
export async function confirmarToken(admin: SupabaseClient, tokenId: string): Promise<void> {
  const { error } = await admin.rpc("dp_portal_token_confirm", { p_token_id: tokenId });
  if (error) console.error(`[token_confirm] ${error.message}`);
}

/** Libera a reserva quando a troca de senha não foi concluída. */
export async function liberarToken(admin: SupabaseClient, tokenId: string): Promise<void> {
  const { error } = await admin.rpc("dp_portal_token_release", { p_token_id: tokenId });
  if (error) console.error(`[token_release] ${error.message}`);
}

export type EventoAcesso =
  | "access_activation_requested"
  | "access_activated"
  | "password_reset_requested"
  | "password_reset_completed"
  | "access_blocked"
  | "access_unblocked";

/** Auditoria: só metadados seguros — nunca senha nem código. */
export async function registrarEvento(
  admin: SupabaseClient,
  evento: EventoAcesso,
  dados: {
    actorUserId: string | null;
    targetUserId: string;
    companyId: string;
    colaboradorId: string;
  },
): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    user_id: dados.actorUserId,
    action: evento,
    table_name: "dp_portal_acesso",
    record_id: dados.targetUserId,
    metadata: {
      colaborador_id: dados.colaboradorId,
      company_id: dados.companyId,
      target_user_id: dados.targetUserId,
    },
  });
  if (error) console.error(`[audit ${evento}] ${error.message}`);
}

const ORIGENS_OK = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|([a-z0-9-]+\.)*(aveto360\.com|lovable\.app|lovableproject\.com|lovable\.dev))$/i;

/** Link de uso único do portal (ativação ou nova senha). */
export function linkDeAcesso(
  origin: string | null,
  purpose: Purpose,
  tokenId: string,
  codigo: string,
): string {
  const base = origin && ORIGENS_OK.test(origin) ? origin : "https://aveto360.com";
  const rota = purpose === "activation" ? "/ativar-acesso" : "/redefinir-acesso";
  return `${base}${rota}?t=${encodeURIComponent(tokenId)}&c=${encodeURIComponent(codigo)}`;
}

/**
 * Tenta encerrar as sessões abertas do usuário pelo mecanismo oficial de
 * autenticação. Mesmo quando isso não é instantâneo, o banco já nega tudo pela
 * verificação central de bloqueio.
 */
export async function revogarSessoes(userId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  try {
    const r = await fetch(`${url}/auth/v1/admin/users/${userId}/logout`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      console.error(`[revogar_sessoes] status ${r.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[revogar_sessoes] ${e instanceof Error ? e.message : "falhou"}`);
    return false;
  }
}
