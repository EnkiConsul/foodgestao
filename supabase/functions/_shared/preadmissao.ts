/**
 * Convite da Pré-Admissão: token seguro, validação e histórico.
 *
 * O token nunca é gravado nem registrado em log — só o seu hash. A empresa da
 * pré-admissão SEMPRE vem do convite validado no servidor; nada que o candidato
 * envie é usado como autorização.
 */
/**
 * Tipo estrutural do cliente de serviço: aceita o cliente vindo de qualquer
 * especificador de import usado pelas funções compartilhadas.
 */
// deno-lint-ignore no-explicit-any
export type Db = { from: (table: string) => any };

export const VALIDADE_PADRAO_DIAS = 7;

export function gerarToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Caminho do link enviado ao candidato (a origem é montada pelo chamador). */
export function linkPreadmissao(origin: string | null, conviteId: string, token: string): string {
  const base = origin && /^https?:\/\//.test(origin) ? origin.replace(/\/$/, "") : "";
  return `${base}/pre-admissao?t=${encodeURIComponent(conviteId)}&c=${encodeURIComponent(token)}`;
}

export interface Preadmissao {
  id: string;
  company_id: string;
  candidato_nome: string;
  whatsapp: string;
  cargo_previsto_id: string | null;
  unidade_prevista_id: string | null;
  trabalho_apos_22h: boolean;
  status: string;
  dados: Record<string, unknown>;
  admin_dados: Record<string, unknown>;
  cpf: string | null;
  email: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  correcao_motivo: string | null;
  colaborador_id: string | null;
}

export type ConviteInvalido = "nao_encontrado" | "expirado" | "revogado" | "encerrado";

export type ConviteValidado =
  | { ok: true; conviteId: string; preadmissao: Preadmissao }
  | { ok: false; motivo: ConviteInvalido };

const ENCERRADOS = ["cancelado", "expirado", "concluido"];

/** Só o hash é comparado; o token não vai para nenhum log. */
export async function validarConvite(
  admin: Db,
  conviteId: string,
  token: string,
): Promise<ConviteValidado> {
  if (!conviteId || !token) return { ok: false, motivo: "nao_encontrado" };
  const tokenHash = await hashToken(token);
  const { data: convite } = await admin
    .from("dp_preadmissao_convites")
    .select("id, preadmissao_id, expires_at, revoked_at")
    .eq("id", conviteId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!convite) return { ok: false, motivo: "nao_encontrado" };
  if (convite.revoked_at) return { ok: false, motivo: "revogado" };
  if (new Date(convite.expires_at as string).getTime() < Date.now()) return { ok: false, motivo: "expirado" };

  const { data: pa } = await admin
    .from("dp_preadmissoes")
    .select(
      "id, company_id, candidato_nome, whatsapp, cargo_previsto_id, unidade_prevista_id, trabalho_apos_22h, status, dados, admin_dados, cpf, email, data_nascimento, estado_civil, correcao_motivo, colaborador_id",
    )
    .eq("id", convite.preadmissao_id as string)
    .maybeSingle();
  if (!pa) return { ok: false, motivo: "nao_encontrado" };
  if (ENCERRADOS.includes(pa.status as string)) return { ok: false, motivo: "encerrado" };
  return { ok: true, conviteId: convite.id as string, preadmissao: pa as unknown as Preadmissao };
}

export async function registrarEvento(
  admin: Db,
  preadmissaoId: string,
  companyId: string,
  evento: string,
  detalhe: Record<string, unknown> = {},
  actorUserId: string | null = null,
): Promise<void> {
  const { error } = await admin.from("dp_preadmissao_eventos").insert({
    preadmissao_id: preadmissaoId,
    company_id: companyId,
    evento,
    detalhe,
    actor_user_id: actorUserId,
  });
  if (error) console.error("[preadmissao] evento não registrado:", error.message);
}

/** Códigos de documento exigidos pelo Cargo e pela Unidade previstos. */
export async function requisitosPrevistos(
  admin: Db,
  pa: Preadmissao,
): Promise<{ cargo: string[]; unidade: string[] }> {
  const cargo: string[] = [];
  const unidade: string[] = [];
  if (pa.cargo_previsto_id) {
    const { data } = await admin
      .from("dp_requisito_cargos")
      .select("dp_documento_requisitos(codigo)")
      .eq("cargo_id", pa.cargo_previsto_id)
      .eq("company_id", pa.company_id);
    for (const r of data ?? []) {
      const c = (r as { dp_documento_requisitos?: { codigo?: string } }).dp_documento_requisitos?.codigo;
      if (c) cargo.push(c);
    }
  }
  if (pa.unidade_prevista_id) {
    const { data } = await admin
      .from("dp_requisito_unidades")
      .select("dp_documento_requisitos(codigo)")
      .eq("unidade_id", pa.unidade_prevista_id)
      .eq("company_id", pa.company_id);
    for (const r of data ?? []) {
      const c = (r as { dp_documento_requisitos?: { codigo?: string } }).dp_documento_requisitos?.codigo;
      if (c) unidade.push(c);
    }
  }
  return { cargo, unidade };
}

/** Campos que o candidato pode gravar. Qualquer outro é descartado. */
export const CAMPOS_CANDIDATO = [
  "nome", "cpf", "email", "data_nascimento", "estado_civil", "sexo", "nacionalidade", "naturalidade",
  "nome_mae", "nome_pai", "grau_instrucao", "raca_cor", "deficiencia",
  "telefone", "whatsapp_contato",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
  "rg_numero", "rg_orgao", "rg_uf", "rg_emissao",
  "ctps_numero", "ctps_serie", "ctps_uf", "ctps_expedicao",
  "titulo_eleitor", "titulo_zona", "titulo_secao",
  "reservista", "reservista_categoria", "pis",
] as const;

export function filtrarCamposCandidato(entrada: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!entrada || typeof entrada !== "object") return out;
  const src = entrada as Record<string, unknown>;
  for (const campo of CAMPOS_CANDIDATO) {
    if (campo in src) {
      const v = src[campo];
      out[campo] = typeof v === "string" ? v.trim() : v;
    }
  }
  return out;
}
