/**
 * Rotinas oficiais da ficha do colaborador, configuração de trabalho, folgas do
 * DP, medidas disciplinares e aceite de anexos.
 *
 * O aplicativo não grava mais direto nessas tabelas: toda gravação passa pelo
 * servidor, que confere empresa, vínculo e regras antes de salvar.
 */
import { supabase } from "@/integrations/supabase/client";

type Json = Record<string, unknown>;

const MENSAGENS: Record<string, string> = {
  UNAUTHENTICATED: "Faça a entrada novamente para continuar.",
  FORBIDDEN: "Você não tem permissão para esta ação nesta empresa.",
  NOT_FOUND: "Registro não encontrado.",
  COLAB_DADOS_INVALIDOS: "Não foi possível ler os dados enviados.",
  COLAB_EMPRESA_OBRIGATORIA: "Selecione a empresa antes de salvar.",
  COLAB_NOME_OBRIGATORIO: "Informe o nome do colaborador.",
  COLAB_CARGO_INVALIDO: "O cargo escolhido não é desta empresa.",
  COLAB_UNIDADE_INVALIDA: "A unidade escolhida não é desta empresa.",
  COLAB_SETOR_INVALIDO: "O setor escolhido não é desta empresa.",
  COLAB_SINDICATO_INVALIDO: "O sindicato escolhido não é desta empresa.",
  COLAB_CPF_INVALIDO: "O CPF informado está incompleto.",
  COLAB_CPF_DUPLICADO: "Já existe um colaborador com este CPF nesta empresa.",
  PIX_TIPO_NAO_PERMITIDO: "A chave Pix aceita é CPF ou celular do próprio colaborador.",
  PIX_CHAVE_OBRIGATORIA: "Informe a chave Pix.",
  PIX_CHAVE_INVALIDA: "A chave Pix informada não confere com o tipo escolhido.",
  TITULAR_TERCEIRO_NAO_PERMITIDO:
    "O pagamento só pode ser feito em chave Pix ou conta do próprio colaborador.",
  CONFIG_VIGENCIA_OBRIGATORIA: "Informe a data de início da vigência.",
  CONFIG_TURNO_INVALIDO: "O turno escolhido não é desta empresa.",
  CONFIG_FOLGA_FIXA_INVALIDA: "Escolha o dia da folga fixa.",
  CONFIG_DIAS_INVALIDOS: "Informe a configuração dos sete dias da semana.",
  CONFIG_INTERVALO_INVALIDO: "O intervalo informado está fora do aceitável.",
  FOLGA_DATA_OBRIGATORIA: "Informe a data da folga.",
  FOLGA_COLABORADOR_INVALIDO: "Colaborador indisponível para receber folga.",
  FOLGA_DUPLICADA: "Este colaborador já tem folga marcada neste dia.",
  FOLGA_LOTE_VAZIO: "Selecione ao menos uma folga.",
  DISC_DATA_OBRIGATORIA: "Informe a data do documento.",
  DISC_DATA_FUTURA: "A data do registro não pode ficar no futuro.",
  DISC_MOTIVO_OBRIGATORIO: "Descreva o motivo do registro.",
  DISC_MOTIVO_EXCLUSAO: "Informe o motivo da exclusão.",
  DISC_SUSPENSAO_DIAS: "Informe os dias de afastamento da suspensão.",
  DISC_REGISTRO_EXCLUIDO: "Este registro já foi excluído.",
  DISC_ARQUIVO_INVALIDO: "Não foi possível anexar o arquivo deste registro.",
  documento_indisponivel: "Este documento não está disponível para aceite.",
  documento_sem_arquivo: "O documento ainda não tem arquivo anexado.",
  aceite_nao_solicitado: "O aceite deste documento não foi solicitado.",
  sem_acesso_portal: "Seu acesso ao portal não está ativo.",
};

/** Traduz os códigos do servidor para linguagem de negócio. */
export function mensagemErroColaborador(erro: unknown, fallback: string): string {
  const texto =
    typeof erro === "string"
      ? erro
      : erro instanceof Error
        ? erro.message
        : ((erro as { message?: string } | null)?.message ?? "");
  for (const [codigo, mensagem] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return mensagem;
  }
  return texto || fallback;
}

function lancar(error: unknown, fallback: string): never {
  throw new Error(mensagemErroColaborador(error, fallback));
}

/** Cadastra ou edita a ficha do colaborador. */
export async function salvarColaborador(input: {
  id?: string | null;
  companyId: string;
  dados: Json;
}): Promise<string> {
  if (!input.id) {
    await garantirLimite(input.companyId, "pessoas", "colaboradores");
  }
  const { data, error } = await (supabase.rpc as any)("dp_colaborador_salvar", {
    p_dados: input.dados,
    p_id: input.id ?? null,
    p_company_id: input.companyId,
  });
  if (error) lancar(error, "Não foi possível salvar o cadastro.");
  return data as string;
}

/** Atualiza contato, endereço e pagamento do próprio cadastro (portal). */
export async function atualizarMeuCadastro(dados: Json): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_colaborador_perfil_atualizar", {
    p_dados: dados,
  });
  if (error) lancar(error, "Não foi possível atualizar seus dados.");
}

export type ConfigDiaPayload = {
  dow: number;
  trabalha: boolean;
  turno_id: string | null;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number | null;
  setor_id: string | null;
};

/** Salva a configuração de trabalho (encerra a anterior e grava os dias juntos). */
export async function salvarConfigTrabalho(input: {
  colaboradorId: string;
  config: {
    vigencia_inicio: string;
    unidade_id: string | null;
    turno_padrao_id: string | null;
    folga_variavel: boolean;
    folga_fixa_dow: number | null;
    observacoes: string | null;
    dias: ConfigDiaPayload[];
  };
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_colaborador_config_salvar", {
    p_colaborador_id: input.colaboradorId,
    p_config: input.config,
  });
  if (error) lancar(error, "Não foi possível salvar a configuração de trabalho.");
  return data as string;
}

export async function encerrarConfigTrabalho(configId: string, fim?: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_colaborador_config_encerrar", {
    p_config_id: configId,
    p_fim: fim ?? null,
  });
  if (error) lancar(error, "Não foi possível encerrar a configuração.");
}

export async function excluirConfigTrabalho(configId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_colaborador_config_excluir", {
    p_config_id: configId,
  });
  if (error) lancar(error, "Não foi possível excluir a configuração.");
}

/** Lança uma folga pelo DP. */
export async function criarFolgaAdmin(input: {
  colaboradorId: string;
  data: string;
  tipo?: string;
  origem?: string;
  observacao?: string | null;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_folga_admin_criar", {
    p_colaborador_id: input.colaboradorId,
    p_data: input.data,
    p_tipo: input.tipo ?? "normal",
    p_origem: input.origem ?? "admin_manual",
    p_observacao: input.observacao ?? null,
  });
  if (error) lancar(error, "Não foi possível lançar a folga.");
  return data as string;
}

/** Publica várias folgas de uma vez (escala). */
export async function criarFolgasLote(
  itens: Array<{ colaborador_id: string; data: string; tipo?: string; origem?: string; observacao?: string | null }>,
): Promise<number> {
  const { data, error } = await (supabase.rpc as any)("dp_folgas_admin_criar_lote", {
    p_itens: itens,
  });
  if (error) lancar(error, "Não foi possível publicar as folgas.");
  return Number(data ?? 0);
}

/** Registra uma medida disciplinar. */
export async function registrarDisciplinar(input: {
  colaboradorId: string;
  tipo: string;
  data: string;
  motivo: string;
  descricao?: string | null;
  suspensaoDias?: number | null;
}): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_registro_disciplinar_registrar", {
    p_colaborador_id: input.colaboradorId,
    p_tipo: input.tipo,
    p_data: input.data,
    p_motivo: input.motivo,
    p_descricao: input.descricao ?? null,
    p_suspensao_dias: input.suspensaoDias ?? null,
  });
  if (error) lancar(error, "Não foi possível registrar a medida disciplinar.");
  return data as string;
}

export async function anexarArquivoDisciplinar(registroId: string, caminho: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_registro_disciplinar_anexar", {
    p_registro_id: registroId,
    p_pdf_storage_path: caminho,
  });
  if (error) lancar(error, "Não foi possível anexar o arquivo do registro.");
}

export async function corrigirDisciplinar(input: {
  id: string;
  colaboradorId?: string | null;
  tipo?: string | null;
  data?: string | null;
  motivo?: string | null;
  descricao?: string | null;
  suspensaoDias?: number | null;
}): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_registro_disciplinar_corrigir", {
    p_registro_id: input.id,
    p_colaborador_id: input.colaboradorId ?? null,
    p_tipo: input.tipo ?? null,
    p_data: input.data ?? null,
    p_motivo: input.motivo ?? null,
    p_descricao: input.descricao ?? null,
    p_suspensao_dias: input.suspensaoDias ?? null,
  });
  if (error) lancar(error, "Não foi possível atualizar o registro.");
}

export async function excluirDisciplinar(id: string, motivo: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dp_registro_disciplinar_excluir", {
    p_registro_id: id,
    p_motivo: motivo,
  });
  if (error) lancar(error, "Não foi possível excluir o registro.");
}

/** Aceite eletrônico de um documento anexado ao checklist. */
export async function aceitarDocumentoAnexo(vinculoId: string): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("dp_documento_anexo_aceitar", {
    p_vinculo_id: vinculoId,
    p_user_agent: navigator.userAgent.slice(0, 500),
  });
  if (error) lancar(error, "Não foi possível registrar o aceite.");
  return data as string;
}

/**
 * Ajuste em lote de benefícios, adicionais e folga fixa. Só alcança
 * colaboradores da empresa informada e recusa qualquer outro campo.
 */
export async function ajustarColaboradoresEmLote(input: {
  companyId: string;
  dados: Json;
  ids?: string[] | null;
  cargoId?: string | null;
  somenteAtivos?: boolean;
}): Promise<number> {
  const { data, error } = await (supabase.rpc as any)("dp_colaboradores_ajustar_lote", {
    p_company_id: input.companyId,
    p_dados: input.dados,
    p_ids: input.ids ?? null,
    p_cargo_id: input.cargoId ?? null,
    p_somente_ativos: input.somenteAtivos ?? false,
  });
  if (error) lancar(error, "Não foi possível aplicar o ajuste.");
  return Number(data ?? 0);
}
