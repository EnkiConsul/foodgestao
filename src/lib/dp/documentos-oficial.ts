/**
 * Porta única das gravações de documentos do colaborador.
 *
 * Nenhuma tela grava documento, checklist, exigência ou histórico direto na
 * tabela: tudo passa por rotina do servidor, que confere empresa, colaborador,
 * unidade, caminho do arquivo e data de pagamento. Repetir a chamada não cria
 * documento duplicado.
 */
import { supabase } from "@/integrations/supabase/client";

type RpcResposta<T> = { data: T | null; error: { message: string } | null };

type ArquivoDoc = {
  file_path: string;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
};

export type RegistrarDocumentoDados = {
  company_id: string;
  colaborador_id?: string | null;
  unidade_id?: string | null;
  tipo?: string | null;
  titulo: string;
  descricao?: string | null;
  file_path: string;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  referencia_data?: string | null;
  ferias_gozo_id?: string | null;
  rescisao_grupo_id?: string | null;
  exige_aceite?: boolean | null;
};

export type SubstituirDocumentoPatch = {
  colaborador_id?: string | null;
  tipo?: string | null;
  /** Competência no formato AAAA-MM. */
  competencia?: string | null;
};

export type SubstituirDocumentoResultado = {
  modo: "nova_versao" | "substituido";
  documento_id: string;
  arquivo_anterior: string | null;
};

export type ExcluirDocumentoResultado = {
  modo: "arquivado" | "cancelado" | "ja_arquivado" | "inexistente" | "removido";
  arquivo_path?: string | null;
};

export type ChecklistDocumentoDados = {
  colaborador_id?: string | null;
  dependente_id?: string | null;
  requisito_id?: string | null;
  documento_id?: string | null;
  status?: "enviado" | "aprovado" | "recusado" | "dispensado";
  validade?: string | null;
  dispensado?: boolean;
  motivo_dispensa?: string | null;
  conteudo_hash?: string | null;
  /** true pede o aceite eletrônico; false cancela o pedido. */
  aceite_solicitado?: boolean;
};

export type RequisitoDocumentoDados = {
  nome?: string;
  descricao?: string | null;
  categoria?: string;
  obrigatoriedade?: string;
  aplica_a?: string;
  tipo_documento?: string;
  periodicidade?: string;
  meses_validade?: number | null;
  dias_aviso?: number;
  ordem?: number;
  permite_multiplos?: boolean;
  exige_aceite?: boolean;
  satisfeito_por?: string | null;
  codigo?: string;
};

export type EventoDocumentoDados = {
  company_id: string;
  documento_id?: string | null;
  origem?: string;
  acao: string;
  titulo?: string | null;
  tipo?: string | null;
  competencia?: string | null;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  unidade_id?: string | null;
  unidade_nome?: string | null;
  arquivo_anterior?: string | null;
  arquivo_novo?: string | null;
  motivo?: string | null;
};

/** Mensagens de negócio para as recusas do servidor. */
const MENSAGENS: Record<string, string> = {
  UNAUTHENTICATED: "Entre na sua conta para continuar.",
  FORBIDDEN: "Você não tem permissão para esta ação nesta empresa.",
  NOT_FOUND: "Documento não encontrado.",
  DOC_EMPRESA_INVALIDA: "Selecione a empresa do documento.",
  DOC_ARQUIVO_OBRIGATORIO: "Anexe o arquivo do documento.",
  DOC_ARQUIVO_FORA_DA_EMPRESA: "O arquivo não pertence a esta empresa.",
  DOC_COLABORADOR_INVALIDO: "O colaborador não pertence a esta empresa.",
  DOC_UNIDADE_INVALIDA: "A unidade não pertence a esta empresa.",
  DOC_TITULO_OBRIGATORIO: "Informe o título do documento.",
  DOC_STATUS_INVALIDO: "Situação do documento não permitida.",
  DOC_MOTIVO_OBRIGATORIO: "Informe o motivo da recusa.",
  DOC_NOME_OBRIGATORIO: "Informe o nome do documento exigido.",
  DOC_REQUISITO_INVALIDO: "Este documento exigido não é da empresa.",
  DOC_DOCUMENTO_INVALIDO: "O arquivo indicado não é deste colaborador.",
  DOC_DEPENDENTE_INVALIDO: "O familiar indicado não é deste colaborador.",
  DOC_COMPROVANTE_DATA_FUTURA: "A data do pagamento não pode ser futura.",
  DOC_COMPROVANTE_DATA_ANTES_DA_COMPETENCIA:
    "A data do pagamento é anterior à competência do documento.",
  DOC_COMPROVANTE_INEXISTENTE: "O documento de origem não tem comprovante anexado.",
  DOC_COMPROVANTE_MESMO_DOCUMENTO: "Escolha um documento diferente para receber o comprovante.",
  DOC_ACAO_OBRIGATORIA: "Ação do histórico não informada.",
  DOC_ORIGEM_INVALIDA: "Origem do documento não reconhecida.",
};

export function mensagemErroDocumento(erro: unknown): string {
  const bruto =
    typeof erro === "string"
      ? erro
      : erro instanceof Error
        ? erro.message
        : ((erro as { message?: string } | null)?.message ?? "");

  for (const [codigo, texto] of Object.entries(MENSAGENS)) {
    if (bruto.includes(codigo)) return texto;
  }
  if (bruto.includes("DOC_CAMPO_NAO_PERMITIDO")) {
    return "Há um campo não permitido nesta gravação.";
  }
  return bruto || "Não foi possível concluir a ação agora.";
}

function cliente() {
  return supabase as unknown as {
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResposta<unknown>>;
  };
}

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(fn, args);
  if (error) throw new Error(mensagemErroDocumento(error));
  return data as T;
}

/** Cria o documento no acervo. Repetir com o mesmo arquivo devolve o mesmo id. */
export async function registrarDocumento(dados: RegistrarDocumentoDados): Promise<string> {
  const id = await chamar<string>("dp_documento_registrar", { p_dados: dados });
  if (!id) throw new Error("O documento não pôde ser registrado.");
  return id;
}

export async function revisarDocumento(
  documentoId: string,
  status: "aprovado" | "recusado" | "pendente",
  motivo?: string | null,
): Promise<void> {
  await chamar("dp_documento_revisar", {
    p_documento_id: documentoId,
    p_status: status,
    p_motivo: motivo ?? null,
  });
}

export async function substituirDocumento(
  documentoId: string,
  arquivo: ArquivoDoc,
  patch?: SubstituirDocumentoPatch,
  motivo?: string | null,
): Promise<SubstituirDocumentoResultado> {
  return await chamar<SubstituirDocumentoResultado>("dp_documento_substituir", {
    p_documento_id: documentoId,
    p_arquivo: arquivo,
    p_patch: patch ?? {},
    p_motivo: motivo ?? null,
  });
}

/**
 * Exclusão de documento: para o DP é lógica (sai da lista e o arquivo fica
 * guardado); para o colaborador é o cancelamento do próprio envio pendente.
 */
export async function excluirDocumento(
  documentoId: string,
  motivo?: string | null,
): Promise<ExcluirDocumentoResultado> {
  return await chamar<ExcluirDocumentoResultado>("dp_documento_excluir", {
    p_documento_id: documentoId,
    p_motivo: motivo ?? null,
  });
}

/** Anexa o comprovante e devolve o caminho do arquivo anterior, se houver. */
export async function anexarComprovante(
  documentoId: string,
  arquivo: ArquivoDoc,
  pagoEm?: string | null,
): Promise<string | null> {
  return await chamar<string | null>("dp_comprovante_anexar", {
    p_documento_id: documentoId,
    p_arquivo: arquivo,
    p_pago_em: pagoEm || null,
  });
}

export async function removerComprovante(documentoId: string): Promise<string | null> {
  return await chamar<string | null>("dp_comprovante_remover", { p_documento_id: documentoId });
}

export async function reassociarComprovante(
  origemId: string,
  destinoId: string,
  motivo?: string | null,
): Promise<void> {
  await chamar("dp_comprovante_reassociar", {
    p_origem_id: origemId,
    p_destino_id: destinoId,
    p_motivo: motivo ?? null,
  });
}

/** Cria ou atualiza a linha do checklist de documentos do colaborador. */
export async function salvarChecklistDocumento(
  id: string | null,
  dados: ChecklistDocumentoDados,
): Promise<string> {
  const novo = await chamar<string>("dp_colaborador_documento_salvar", {
    p_id: id,
    p_dados: dados,
  });
  if (!novo) throw new Error("O documento do checklist não pôde ser salvo.");
  return novo;
}

export async function excluirChecklistDocumento(
  id: string,
  motivo?: string | null,
): Promise<ExcluirDocumentoResultado> {
  return await chamar<ExcluirDocumentoResultado>("dp_colaborador_documento_excluir", {
    p_id: id,
    p_motivo: motivo ?? null,
  });
}

export async function salvarRequisitoDocumento(
  id: string | null,
  dados: RequisitoDocumentoDados,
  companyId?: string | null,
): Promise<string> {
  const novo = await chamar<string>("dp_documento_requisito_salvar", {
    p_id: id,
    p_dados: dados,
    p_company_id: companyId ?? null,
  });
  if (!novo) throw new Error("O documento exigido não pôde ser salvo.");
  return novo;
}

export async function excluirRequisitoDocumento(id: string): Promise<void> {
  await chamar("dp_documento_requisito_excluir", { p_id: id });
}

export async function registrarEventoDocumento(dados: EventoDocumentoDados): Promise<void> {
  await chamar("dp_documento_evento_registrar", { p_dados: dados });
}
