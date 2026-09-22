/**
 * Rotinas oficiais das regras de Pessoas 360° (Fase 10).
 *
 * As tabelas de regras (configuração do DP, bloqueios, datas bloqueadas, limite
 * de folgas do dia, regras e períodos de férias, cobertura mínima, dependentes,
 * disponibilidade em outras unidades, avisos e comentários) não aceitam mais
 * gravação direta: tudo passa por estas rotinas, que conferem o conteúdo, o
 * escopo da empresa e registram o histórico de quem alterou.
 */
import { supabase } from "@/integrations/supabase/client";

type Json = Record<string, unknown>;

/** Traduz os códigos das rotinas para linguagem de negócio. */
export function mensagemErroRegra(erro: unknown, fallback = "Não foi possível salvar a regra."): string {
  const msg = erro instanceof Error ? erro.message : typeof erro === "string" ? erro : (erro as { message?: string })?.message ?? "";
  if (!msg) return fallback;
  if (msg.includes("UNAUTHENTICATED")) return "Entre novamente para continuar.";
  if (msg.includes("FORBIDDEN")) return "Só o administrador da empresa pode alterar essa regra.";
  if (msg.includes("NOT_FOUND")) return "Registro não encontrado.";
  if (msg.includes("REGRA_CAMPO_INVALIDO")) return "Há um campo não permitido nesta regra.";
  if (msg.includes("REGRA_FORA_DA_FAIXA")) return "Um dos valores informados está fora do permitido.";
  if (msg.includes("REGRA_ESCOPO_INVALIDO")) return "Unidade, cargo, setor, turno ou pessoa não pertencem a esta empresa.";
  if (msg.includes("REGRA_EMPRESA_OBRIGATORIA")) return "Selecione a empresa.";
  if (msg.includes("REGRA_UNIDADE_OBRIGATORIA")) return "Escolha pelo menos uma unidade.";
  if (msg.includes("REGRA_DATA_OBRIGATORIA")) return "Informe a data.";
  if (msg.includes("REGRA_MOTIVO_OBRIGATORIO")) return "Informe o motivo.";
  if (msg.includes("REGRA_MOTIVO_INVALIDO")) return "O motivo está longo demais.";
  if (msg.includes("REGRA_NOME_OBRIGATORIO")) return "Informe a descrição.";
  if (msg.includes("REGRA_NOME_INVALIDO")) return "A descrição está longa demais.";
  if (msg.includes("REGRA_PERIODO_INVERTIDO")) return "A data final deve ser posterior à inicial.";
  if (msg.includes("REGRA_PERIODO_LONGO")) return "O período não pode passar de um ano.";
  if (msg.includes("REGRA_LOTE_GRANDE")) return "São muitas datas de uma só vez.";
  if (msg.includes("REGRA_SEM_DADOS")) return "Nada foi alterado.";
  if (msg.includes("REGRA_CPF_INVALIDO")) return "O CPF informado é inválido.";
  if (msg.includes("REGRA_PARENTESCO_OBRIGATORIO")) return "Informe o grau de parentesco.";
  if (msg.includes("REGRA_PARENTESCO_INVALIDO")) return "Grau de parentesco não aceito: use filho, enteado, tutelado, cônjuge ou outro.";
  if (msg.includes("REGRA_DATA_FUTURA")) return "A data de nascimento não pode ser futura.";
  if (msg.includes("REGRA_PESSOA_INVALIDA")) return "Escolha um colaborador ou uma pessoa de apoio.";
  if (msg.includes("AVISO_TITULO_INVALIDO")) return "O título do aviso precisa ter de 3 a 200 caracteres.";
  if (msg.includes("AVISO_CONTEUDO_INVALIDO")) return "Escreva o conteúdo do aviso.";
  if (msg.includes("AVISO_PRIORIDADE_INVALIDA")) return "Prioridade inválida.";
  if (msg.includes("AVISO_ESCOPO_INVALIDO")) return "Público do aviso inválido.";
  if (msg.includes("AVISO_SEM_COMENTARIOS")) return "Este aviso não aceita comentários.";
  if (msg.includes("COMENTARIO_VAZIO")) return "Escreva o comentário.";
  if (msg.includes("COMENTARIO_LONGO")) return "O comentário está longo demais.";
  if (msg.includes("COMENTARIO_STATUS_INVALIDO")) return "Situação de comentário inválida.";
  return fallback;
}

function erro(e: { message?: string } | null, fallback?: string): never | void {
  if (e) throw new Error(mensagemErroRegra(e, fallback ?? mensagemErroRegra(e)));
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  nome: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

/** Configuração do DP (regras de folgas, férias, vales, adicionais). */
export async function salvarConfigDp(input: {
  companyId: string;
  unidadeId?: string | null;
  patch: Json;
  justificativa?: string | null;
  ciencia?: boolean;
  rotulo?: string;
}): Promise<string> {
  const { data, error } = await rpc("dp_config_dp_salvar", {
    p_company_id: input.companyId,
    p_unidade_id: input.unidadeId ?? null,
    p_patch: input.patch,
    p_justificativa: input.justificativa ?? null,
    p_ciencia: input.ciencia ?? false,
  });
  erro(error, "Não foi possível salvar a regra.");
  return data as string;
}

export async function removerExcecaoConfigDp(companyId: string, unidadeId: string): Promise<void> {
  const { error } = await rpc("dp_config_dp_excecao_excluir", {
    p_company_id: companyId,
    p_unidade_id: unidadeId,
  });
  erro(error, "Não foi possível remover a exceção.");
}

/** Regra de datas bloqueadas (feriados, datas fixas e dinâmicas). */
export async function salvarRegraBloqueio(input: {
  companyId: string;
  regra: Json;
  unidades?: string[];
}): Promise<string> {
  const { data, error } = await rpc("dp_bloqueio_regra_salvar", {
    p_company_id: input.companyId,
    p_regra: input.regra,
    p_unidades: input.unidades ?? [],
  });
  erro(error);
  return data as string;
}

export async function excluirRegraBloqueio(id: string, motivo?: string | null): Promise<void> {
  const { error } = await rpc("dp_bloqueio_regra_excluir", { p_id: id, p_motivo: motivo ?? null });
  erro(error, "Não foi possível excluir a regra.");
}

/** Data bloqueada (ou liberada) de um dia específico. */
export async function salvarDataBloqueada(input: {
  companyId: string;
  data: string;
  motivo: string;
  unidadeId?: string | null;
  liberada?: boolean;
  id?: string | null;
}): Promise<string> {
  const { data, error } = await rpc("dp_data_bloqueada_salvar", {
    p_company_id: input.companyId,
    p_data: input.data,
    p_motivo: input.motivo,
    p_unidade_id: input.unidadeId ?? null,
    p_liberada: input.liberada ?? false,
    p_id: input.id ?? null,
  });
  erro(error, "Não foi possível salvar o bloqueio.");
  return data as string;
}

export async function definirDatasBloqueadasLote(input: {
  companyId: string;
  datas: string[];
  unidades: string[];
  motivo: string;
  liberada?: boolean;
}): Promise<number> {
  const { data, error } = await rpc("dp_datas_bloqueadas_definir_lote", {
    p_company_id: input.companyId,
    p_datas: input.datas,
    p_unidades: input.unidades,
    p_motivo: input.motivo,
    p_liberada: input.liberada ?? false,
  });
  erro(error, "Não foi possível bloquear as datas.");
  return Number(data ?? 0);
}

export async function excluirDataBloqueada(id: string): Promise<void> {
  const { error } = await rpc("dp_data_bloqueada_excluir", { p_id: id });
  erro(error, "Não foi possível remover o bloqueio.");
}

export async function rebloquearData(id: string): Promise<void> {
  const { error } = await rpc("dp_data_bloqueada_rebloquear", { p_id: id });
  erro(error, "Não foi possível bloquear a data novamente.");
}

/** Limite de folgas de um dia. */
export async function definirLimiteDoDia(input: {
  companyId: string;
  data: string;
  limite: number;
  unidadeId?: string | null;
  observacao?: string | null;
}): Promise<string> {
  const { data, error } = await rpc("dp_dia_config_definir", {
    p_company_id: input.companyId,
    p_data: input.data,
    p_limite: input.limite,
    p_unidade_id: input.unidadeId ?? null,
    p_observacao: input.observacao ?? null,
  });
  erro(error, "Não foi possível salvar o limite do dia.");
  return data as string;
}

export async function excluirLimiteDoDia(id: string): Promise<void> {
  const { error } = await rpc("dp_dia_config_excluir", { p_id: id });
  erro(error, "Não foi possível remover o limite do dia.");
}

/** Regra de férias simultâneas. */
export async function salvarRegraFerias(companyId: string, regra: Json): Promise<string> {
  const { data, error } = await rpc("dp_ferias_regra_salvar", { p_company_id: companyId, p_regra: regra });
  erro(error);
  return data as string;
}

export async function excluirRegraFerias(id: string, motivo?: string | null): Promise<void> {
  const { error } = await rpc("dp_ferias_regra_excluir", { p_id: id, p_motivo: motivo ?? null });
  erro(error, "Não foi possível excluir a regra.");
}

/** Período bloqueado para férias. */
export async function salvarBloqueioFerias(companyId: string, bloqueio: Json): Promise<string> {
  const { data, error } = await rpc("dp_ferias_bloqueio_salvar", {
    p_company_id: companyId,
    p_bloqueio: bloqueio,
  });
  erro(error, "Não foi possível salvar o período bloqueado.");
  return data as string;
}

export async function excluirBloqueioFerias(id: string, motivo?: string | null): Promise<void> {
  const { error } = await rpc("dp_ferias_bloqueio_excluir", { p_id: id, p_motivo: motivo ?? null });
  erro(error, "Não foi possível excluir o período bloqueado.");
}

/** Cobertura mínima por turno. */
export async function salvarCoberturaMinima(companyId: string, regra: Json): Promise<string> {
  const { data, error } = await rpc("dp_cobertura_minima_salvar", { p_company_id: companyId, p_regra: regra });
  erro(error, "Não foi possível salvar a cobertura mínima.");
  return data as string;
}

export async function excluirCoberturaMinima(id: string, motivo?: string | null): Promise<void> {
  const { error } = await rpc("dp_cobertura_minima_excluir", { p_id: id, p_motivo: motivo ?? null });
  erro(error, "Não foi possível excluir a cobertura mínima.");
}

/** Grau de parentesco aceito na admissão. */
export async function definirParentescoAdmissao(input: {
  companyId: string;
  parentesco: string;
  dependente: boolean;
  sesc: boolean;
}): Promise<void> {
  const { error } = await rpc("dp_admissao_regra_parentesco_definir", {
    p_company_id: input.companyId,
    p_parentesco: input.parentesco,
    p_dependente: input.dependente,
    p_sesc: input.sesc,
  });
  erro(error, "Não foi possível salvar o grau de parentesco.");
}

/** Dependentes do colaborador. */
export async function salvarDependente(colaboradorId: string, dependente: Json): Promise<string> {
  const { data, error } = await rpc("dp_dependente_salvar", {
    p_colaborador_id: colaboradorId,
    p_dependente: dependente,
  });
  erro(error, "Não foi possível salvar o dependente.");
  return data as string;
}

export async function excluirDependente(id: string): Promise<void> {
  const { error } = await rpc("dp_dependente_excluir", { p_id: id });
  erro(error, "Não foi possível remover o dependente.");
}

/** Disponibilidade da pessoa em outra unidade. */
export async function salvarApoioUnidade(companyId: string, apoio: Json): Promise<string> {
  const { data, error } = await rpc("dp_apoio_unidade_salvar", { p_company_id: companyId, p_apoio: apoio });
  erro(error, "Não foi possível salvar a disponibilidade.");
  return data as string;
}

export async function excluirApoioUnidade(id: string): Promise<void> {
  const { error } = await rpc("dp_apoio_unidade_excluir", { p_id: id });
  erro(error, "Não foi possível remover a disponibilidade.");
}

/** Avisos e comentários do mural. */
export async function salvarAviso(companyId: string, aviso: Json): Promise<string> {
  const { data, error } = await rpc("dp_aviso_salvar", { p_company_id: companyId, p_aviso: aviso });
  erro(error, "Não foi possível salvar o aviso.");
  return data as string;
}

export async function excluirAviso(id: string): Promise<void> {
  const { error } = await rpc("dp_aviso_excluir", { p_id: id });
  erro(error, "Não foi possível remover o aviso.");
}

export async function comentarAviso(input: {
  avisoId: string;
  conteudo: string;
  autorNome?: string | null;
}): Promise<string> {
  const { data, error } = await rpc("dp_aviso_comentar", {
    p_aviso_id: input.avisoId,
    p_conteudo: input.conteudo,
    p_autor_nome: input.autorNome ?? null,
  });
  erro(error, "Não foi possível enviar o comentário.");
  return data as string;
}

export async function excluirComentarioAviso(id: string): Promise<void> {
  const { error } = await rpc("dp_aviso_comentario_excluir", { p_id: id });
  erro(error, "Não foi possível remover o comentário.");
}

export async function moderarComentarioAviso(id: string, status: "aprovado" | "oculto" | "pendente"): Promise<void> {
  const { error } = await rpc("dp_aviso_comentario_moderar", { p_id: id, p_status: status });
  erro(error, "Não foi possível moderar o comentário.");
}

/** Registro de ciência de regra no histórico da empresa. */
export async function registrarCienciaRegra(input: {
  companyId: string;
  tabela: string;
  registroId?: string | null;
  justificativa?: string | null;
  valorAntigo?: unknown;
  valorNovo?: unknown;
  ciencia?: boolean;
}): Promise<void> {
  const { error } = await rpc("dp_regras_ciencia_registrar", {
    p_company_id: input.companyId,
    p_tabela: input.tabela,
    p_registro_id: input.registroId ?? null,
    p_justificativa: input.justificativa ?? null,
    p_valor_antigo: (input.valorAntigo ?? null) as Json | null,
    p_valor_novo: (input.valorNovo ?? null) as Json | null,
    p_ciencia: input.ciencia ?? true,
  });
  erro(error, "Não foi possível registrar a ciência.");
}
