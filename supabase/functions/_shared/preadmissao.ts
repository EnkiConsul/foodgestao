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

/** Normaliza o WhatsApp para dígitos com país + DDD + número. */
export function normalizarWhatsapp(entrada: string): string | null {
  let d = (entrada ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

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
  versao?: number;
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

// ─────────────────────────────────────────────────────────────────────────────
// Fases, payload manipulado e validação de conteúdo
// ─────────────────────────────────────────────────────────────────────────────

/** Únicos estados em que o candidato pode gravar dados ou enviar arquivo. */
export const ESTADOS_EDITAVEIS_CANDIDATO = [
  "aguardando_preenchimento",
  "em_preenchimento",
  "correcao_solicitada",
  "aguardando_nova_versao",
] as const;

export function candidatoPodeEditar(status: string): boolean {
  return (ESTADOS_EDITAVEIS_CANDIDATO as readonly string[]).includes(status);
}

/**
 * Requisito 70: payload manipulado é REJEITADO, não silenciosamente filtrado.
 * Devolve as chaves que não pertencem à allowlist do candidato.
 */
export function camposNaoPermitidos(entrada: unknown): string[] {
  if (!entrada || typeof entrada !== "object") return [];
  const permitidos = new Set<string>(CAMPOS_CANDIDATO as readonly string[]);
  return Object.keys(entrada as Record<string, unknown>).filter((k) => !permitidos.has(k));
}

export function cpfValido(entrada?: string | null): boolean {
  const d = (entrada ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

export function emailValido(entrada?: string | null): boolean {
  const v = (entrada ?? "").trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v);
}

/** Data real no formato AAAA-MM-DD (rejeita 2024-02-31 e afins). */
export function dataValida(entrada?: string | null): boolean {
  const v = (entrada ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const SEXOS = ["masculino", "feminino", "nao_informado"] as const;

export const ESTADOS_CIVIS = [
  "solteiro", "casado", "uniao_estavel", "divorciado", "viuvo", "separado",
] as const;

/**
 * Validação de conteúdo dos dados do candidato. Só valida o que veio: campos
 * ausentes ficam pendentes no checklist, não geram erro de formato.
 */
export function validarDadosCandidato(
  dados: Record<string, unknown>,
  hoje = new Date(),
): Record<string, string> {
  const erros: Record<string, string> = {};
  const txt = (k: string) => (typeof dados[k] === "string" ? (dados[k] as string).trim() : "");

  if (txt("cpf") && !cpfValido(txt("cpf"))) erros.cpf = "Informe um CPF válido.";
  if (txt("email") && !emailValido(txt("email"))) erros.email = "Informe um e-mail válido.";

  const nasc = txt("data_nascimento");
  if (nasc) {
    if (!dataValida(nasc)) {
      erros.data_nascimento = "Informe uma data de nascimento válida.";
    } else {
      const dt = new Date(`${nasc}T00:00:00Z`);
      const hojeUtc = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
      const anos = (hojeUtc.getTime() - dt.getTime()) / (365.2425 * 86400000);
      if (dt.getTime() > hojeUtc.getTime()) erros.data_nascimento = "A data de nascimento não pode ser futura.";
      else if (anos > 100) erros.data_nascimento = "Confira a data de nascimento: o ano informado é improvável.";
      else if (anos < 14) erros.data_nascimento = "A idade mínima para admissão é 14 anos (aprendiz).";
    }
  }
  for (const campo of ["rg_emissao", "ctps_expedicao"]) {
    if (txt(campo) && !dataValida(txt(campo))) erros[campo] = "Informe uma data válida.";
  }
  if (txt("sexo") && !(SEXOS as readonly string[]).includes(txt("sexo"))) erros.sexo = "Selecione uma opção de sexo.";
  if (txt("estado_civil") && !(ESTADOS_CIVIS as readonly string[]).includes(txt("estado_civil"))) {
    erros.estado_civil = "Selecione um estado civil da lista.";
  }
  if (txt("uf") && !/^[A-Za-z]{2}$/.test(txt("uf"))) erros.uf = "Informe a UF com duas letras.";
  if (txt("cep") && txt("cep").replace(/\D/g, "").length !== 8) erros.cep = "Informe um CEP com 8 dígitos.";
  if (txt("pis") && txt("pis").replace(/\D/g, "").length !== 11) erros.pis = "Informe o PIS com 11 dígitos.";
  return erros;
}

/** Requisitos condicionais configurados pela empresa (sem vínculo de cargo/unidade). */
export async function requisitosEmpresa(admin: Db, companyId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("dp_documento_requisitos")
    .select("codigo")
    .eq("company_id", companyId);
  if (error) return [];
  return (data ?? []).map((r: { codigo: string }) => r.codigo).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transições e documentos: sempre pelas rotinas travadas do banco
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
export type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => any };

export type ResultadoTransicao =
  | { ok: true; status: string; status_anterior: string }
  | { ok: false; motivo: string; status?: string };

/**
 * Muda a situação (e grava o patch) dentro de uma transação com trava: se outra
 * requisição mudou o estado antes, esta falha em vez de sobrescrever.
 */
export async function transicionar(
  admin: Rpc,
  preadmissaoId: string,
  de: string[] | null,
  para: string | null,
  patch: Record<string, unknown> = {},
): Promise<ResultadoTransicao> {
  const { data, error } = await admin.rpc("dp_preadmissao_transicionar", {
    p_preadmissao_id: preadmissaoId,
    p_de: de,
    p_para: para,
    p_patch: patch,
  });
  if (error) {
    console.error("[preadmissao] transição falhou:", error.message);
    return { ok: false, motivo: "erro_gravacao" };
  }
  return data as ResultadoTransicao;
}

export async function registrarDocumento(
  admin: Rpc,
  args: {
    preadmissaoId: string;
    codigo: string;
    pessoaId: string | null;
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<{ ok: boolean; motivo?: string; documento_id?: string; versao?: number }> {
  const { data, error } = await admin.rpc("dp_preadmissao_documento_registrar", {
    p_preadmissao_id: args.preadmissaoId,
    p_requisito_codigo: args.codigo,
    p_pessoa_id: args.pessoaId,
    p_file_path: args.filePath,
    p_file_name: args.fileName,
    p_mime_type: args.mimeType,
    p_file_size: args.fileSize,
  });
  if (error) {
    console.error("[preadmissao] documento não registrado:", error.message);
    return { ok: false, motivo: "erro_gravacao" };
  }
  return data as { ok: boolean; motivo?: string };
}

/**
 * Confere o tipo real do arquivo pelos bytes iniciais — o MIME declarado pelo
 * cliente não é aceito como prova.
 */
export function tipoRealDoArquivo(bytes: Uint8Array): string | null {
  const b = bytes;
  const eq = (pos: number, ...vals: number[]) => vals.every((v, i) => b[pos + i] === v);
  if (eq(0, 0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (eq(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (eq(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (eq(0, 0x52, 0x49, 0x46, 0x46) && eq(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (eq(4, 0x66, 0x74, 0x79, 0x70)) {
    const marca = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (marca.startsWith("hei") || marca.startsWith("hev") || marca.startsWith("mif")) return "image/heic";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist da raiz e dos familiares + gravação sob trava (concorrência)
// ─────────────────────────────────────────────────────────────────────────────

/** Chaves aceitas na raiz do pedido do candidato. */
export const CAMPOS_RAIZ_CANDIDATO = ["t", "c", "action", "dados", "pessoas", "versao"] as const;

/** Campos aceitos em cada familiar informado pelo candidato. */
export const CAMPOS_PESSOA = [
  "id", "nome", "parentesco", "data_nascimento", "cpf", "rg",
  "finalidade_dependente", "finalidade_sesc",
] as const;

export function camposNaoPermitidosRaiz(
  body: unknown,
  permitidos: readonly string[] = CAMPOS_RAIZ_CANDIDATO,
): string[] {
  if (!body || typeof body !== "object") return [];
  const set = new Set(permitidos);
  return Object.keys(body as Record<string, unknown>).filter((k) => !set.has(k));
}

/** Campos fora da allowlist em qualquer familiar (requisito 70 também aqui). */
export function camposNaoPermitidosPessoas(pessoas: unknown): string[] {
  if (!Array.isArray(pessoas)) return [];
  const set = new Set<string>(CAMPOS_PESSOA as readonly string[]);
  const fora = new Set<string>();
  pessoas.forEach((p, i) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      fora.add(`familiar ${i + 1}: registro inválido`);
      return;
    }
    for (const k of Object.keys(p as Record<string, unknown>)) {
      if (!set.has(k)) fora.add(`familiar ${i + 1}: ${k}`);
    }
  });
  return [...fora];
}

export function filtrarPessoasCandidato(pessoas: unknown): Record<string, unknown>[] {
  if (!Array.isArray(pessoas)) return [];
  return pessoas.map((p) => {
    const src = (p ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const campo of CAMPOS_PESSOA) {
      if (campo in src) {
        const v = src[campo];
        out[campo] = typeof v === "string" ? v.trim() : v;
      }
    }
    return out;
  });
}

/** Mensagens dos motivos devolvidos pela rotina travada do banco. */
export const MOTIVOS_GRAVACAO: Record<string, string> = {
  nao_encontrada: "Este link não é válido. Peça um novo link à empresa.",
  fase_encerrada:
    "Sua ficha já está em análise pela empresa. Aguarde o contato: não é possível alterar os dados agora.",
  versao_alterada:
    "Sua ficha foi atualizada em outro dispositivo. Recarregue a página e tente novamente.",
  pessoa_nome: "Informe o nome completo de cada familiar.",
  pessoa_parentesco: "Selecione o parentesco de cada familiar na lista.",
  pessoa_finalidade: "Marque se o familiar é dependente, Sesc ou ambos.",
  pessoa_sesc_parentesco: "Este parentesco não é aceito no Sesc.",
  pessoa_cpf: "Informe um CPF válido para o familiar.",
  pessoa_data: "Informe uma data de nascimento válida para o familiar.",
  pessoa_data_futura: "A data de nascimento do familiar não pode ser futura.",
  pessoa_desconhecida: "Um dos familiares informados não pertence mais a esta ficha. Recarregue a página.",
  titular_invalido: "O familiar deste documento não pertence a esta ficha.",
};

export interface ResultadoGravacao {
  ok: boolean;
  motivo?: string;
  status?: string;
  versao?: number;
  indice?: number;
}

/** Dados + familiares + remoções em uma única transação com trava na ficha. */
export async function salvarCandidato(
  admin: Rpc,
  args: {
    preadmissaoId: string;
    estados: readonly string[];
    statusNovo: string | null;
    dados: Record<string, unknown>;
    campos: Record<string, unknown>;
    pessoas: Record<string, unknown>[] | null;
    versaoEsperada?: number | null;
  },
): Promise<ResultadoGravacao> {
  const { data, error } = await admin.rpc("dp_preadmissao_salvar_candidato", {
    p_preadmissao_id: args.preadmissaoId,
    p_estados: args.estados,
    p_status_novo: args.statusNovo,
    p_dados: args.dados,
    p_campos: args.campos,
    p_pessoas: args.pessoas,
    p_versao_esperada: args.versaoEsperada ?? null,
  });
  if (error) {
    console.error("[preadmissao] gravação falhou:", error.message);
    return { ok: false, motivo: "erro_gravacao" };
  }
  return data as ResultadoGravacao;
}

/** Envio ao gestor: estado editável + conteúdo inalterado desde a conferência. */
export async function enviarFicha(
  admin: Rpc,
  preadmissaoId: string,
  estados: readonly string[],
  versaoEsperada: number | null,
): Promise<ResultadoGravacao & { status_anterior?: string }> {
  const { data, error } = await admin.rpc("dp_preadmissao_enviar", {
    p_preadmissao_id: preadmissaoId,
    p_estados: estados,
    p_versao_esperada: versaoEsperada,
  });
  if (error) {
    console.error("[preadmissao] envio falhou:", error.message);
    return { ok: false, motivo: "erro_gravacao" };
  }
  return data as ResultadoGravacao & { status_anterior?: string };
}

/** Transição com versão esperada: conferência antiga não é aplicada. */
export async function transicionarComVersao(
  admin: Rpc,
  preadmissaoId: string,
  de: string[] | null,
  para: string | null,
  patch: Record<string, unknown> = {},
  versaoEsperada: number | null = null,
): Promise<ResultadoTransicao & { versao?: number }> {
  const { data, error } = await admin.rpc("dp_preadmissao_transicionar_versionado", {
    p_preadmissao_id: preadmissaoId,
    p_de: de,
    p_para: para,
    p_patch: patch,
    p_versao_esperada: versaoEsperada,
  });
  if (error) {
    console.error("[preadmissao] transição falhou:", error.message);
    return { ok: false, motivo: "erro_gravacao" };
  }
  return data as ResultadoTransicao & { versao?: number };
}
