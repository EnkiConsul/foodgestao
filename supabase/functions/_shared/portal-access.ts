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

/** Validade: ativação 48h, redefinição 2h. */
const VALIDADE_HORAS: Record<Purpose, number> = { activation: 48, reset: 2 };

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
    agora.getTime() + VALIDADE_HORAS[input.purpose] * 3_600_000,
  ).toISOString();

  const { error } = await admin.from("dp_portal_access_tokens").insert({
    user_id: input.userId,
    colaborador_id: input.colaboradorId,
    company_id: input.companyId,
    token_hash: await hashCodigo(input.userId, codigo),
    purpose: input.purpose,
    expires_at: expiresAt,
    created_by: input.createdBy,
  });
  if (error) throw new Error(`token_insert: ${error.message}`);

  return { codigo, expiresAt };
}

export interface TokenValido {
  id: string;
  user_id: string;
  colaborador_id: string;
  company_id: string;
  purpose: Purpose;
}

/**
 * Consome um código: só vale se pertencer ao usuário, estar dentro do prazo e
 * nunca ter sido usado. A troca de `consumed_at` é condicional (uso único
 * mesmo com dois pedidos simultâneos).
 */
export async function consumirToken(
  admin: SupabaseClient,
  userId: string,
  codigo: string,
): Promise<TokenValido | null> {
  const hash = await hashCodigo(userId, codigo);
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("dp_portal_access_tokens")
    .update({ consumed_at: agora })
    .eq("token_hash", hash)
    .eq("user_id", userId)
    .is("consumed_at", null)
    .gt("expires_at", agora)
    .select("id, user_id, colaborador_id, company_id, purpose")
    .maybeSingle();
  if (error) throw new Error(`token_consume: ${error.message}`);
  return (data as TokenValido | null) ?? null;
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
export function linkDeAcesso(origin: string | null, purpose: Purpose, codigo: string): string {
  const base = origin && ORIGENS_OK.test(origin) ? origin : "https://aveto360.com";
  const rota = purpose === "activation" ? "/ativar-acesso" : "/redefinir-acesso";
  return `${base}${rota}?c=${encodeURIComponent(codigo)}`;
}
