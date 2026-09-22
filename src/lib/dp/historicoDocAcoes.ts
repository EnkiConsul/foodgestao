import { supabase } from "@/integrations/supabase/client";

/**
 * Ações de manutenção dos documentos listados no Histórico.
 * Cada linha do histórico vem de uma origem diferente (acervo do DP,
 * atestados, negociações sindicais e registros disciplinares); aqui as
 * operações de excluir/substituir são roteadas para a tabela e o bucket certos.
 */
export type DocSource = "doc" | "sol" | "sind" | "disc";

type SourceConfig = {
  table: string;
  pathCol: string;
  bucket: string;
  label: string;
  /** Permite corrigir colaborador/tipo/competência ao substituir. */
  editavel: boolean;
};

const CFG: Record<DocSource, SourceConfig> = {
  doc: { table: "dp_documentos", pathCol: "file_path", bucket: "dp-documentos", label: "Documento", editavel: true },
  sol: { table: "dp_solicitacoes", pathCol: "arquivo_path", bucket: "dp-atestados", label: "Atestado", editavel: false },
  sind: { table: "dp_sindicato_negociacoes", pathCol: "pdf_path", bucket: "dp-sindicato", label: "Negociação sindical", editavel: false },
  disc: { table: "dp_registros_disciplinares", pathCol: "pdf_storage_path", bucket: "dp-disciplinar", label: "Registro disciplinar", editavel: false },
};

export function parseDocRowId(rowId: string): { source: DocSource; id: string } {
  const [prefix, ...rest] = rowId.split(":");
  const source = (["doc", "sol", "sind", "disc"] as DocSource[]).includes(prefix as DocSource)
    ? (prefix as DocSource)
    : "doc";
  return { source, id: rest.join(":") || rowId };
}

export function docSourceConfig(rowId: string): SourceConfig {
  return CFG[parseDocRowId(rowId).source];
}

export function podeEditarClassificacao(rowId: string) {
  return docSourceConfig(rowId).editavel;
}

/** Dados descritivos do documento, preservados no log mesmo após a exclusão. */
export type DocEventoMeta = {
  companyId: string;
  titulo?: string | null;
  tipo?: string | null;
  competencia?: string | null;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  unidade_id?: string | null;
  unidade_nome?: string | null;
  motivo?: string | null;
};

/**
 * Grava o log da ação. O servidor confere a empresa e guarda quem fez.
 * Falhas de log não impedem a operação principal, mas ficam no console.
 */
async function registrarEvento(params: {
  rowId: string;
  acao: "excluido" | "substituido" | "nova_versao";
  meta?: DocEventoMeta;
  arquivo_anterior?: string | null;
  arquivo_novo?: string | null;
}) {
  const { meta } = params;
  if (!meta?.companyId) return;
  const { source, id } = parseDocRowId(params.rowId);
  try {
    await registrarEventoDocumento({
      company_id: meta.companyId,
      documento_id: id,
      origem: source,
      acao: params.acao,
      titulo: meta.titulo ?? null,
      tipo: meta.tipo ?? null,
      competencia: meta.competencia ?? null,
      colaborador_id: meta.colaborador_id ?? null,
      colaborador_nome: meta.colaborador_nome ?? null,
      unidade_id: meta.unidade_id ?? null,
      unidade_nome: meta.unidade_nome ?? null,
      arquivo_anterior: params.arquivo_anterior ?? null,
      arquivo_novo: params.arquivo_novo ?? null,
      motivo: meta.motivo ?? null,
    });
  } catch (e) {
    console.error("Falha ao registrar log do documento", e);
  }
}

/** Remove o arquivo do armazenamento, ignorando falhas de arquivo inexistente. */
async function removerArquivo(bucket: string, path?: string | null) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

/**
 * Tira o documento da lista guardando o histórico.
 *
 * O arquivo e as assinaturas eletrônicas já registradas são preservados: são
 * evidência histórica. Cada origem usa a rotina oficial do servidor.
 */
export async function excluirDocumentoHistorico(
  rowId: string,
  filePath?: string | null,
  meta?: DocEventoMeta,
) {
  const { source, id } = parseDocRowId(rowId);
  const cfg = CFG[source];
  const motivo = meta?.motivo ?? "Excluído no Histórico de documentos";

  if (source === "doc") {
    await excluirDocumento(id, motivo);
    await registrarEvento({ rowId, acao: "excluido", meta, arquivo_anterior: filePath });
    return;
  }

  if (source === "sol") {
    await excluirSolicitacao({ solicitacaoId: id, motivo });
    await registrarEvento({ rowId, acao: "excluido", meta, arquivo_anterior: filePath });
    return;
  }

  if (source === "disc") {
    await excluirDisciplinar(id, motivo);
    await registrarEvento({ rowId, acao: "excluido", meta, arquivo_anterior: filePath });
    return;
  }

  await registrarEvento({ rowId, acao: "excluido", meta, arquivo_anterior: filePath });
  const { error } = await supabase.from(cfg.table as any).delete().eq("id", id);
  if (error) throw error;
  await removerArquivo(cfg.bucket, filePath);
}


export type SubstituirPatch = {
  colaborador_id?: string | null;
  /** Tipo do documento (somente acervo do DP). */
  tipo?: string;
  /** Competência no formato YYYY-MM. */
  competencia?: string | null;
};

/**
 * Substitui o arquivo de um documento já registrado.
 *
 * No acervo do DP quem decide é o servidor: se o documento já foi assinado, ele
 * publica uma NOVA VERSÃO e preserva o arquivo, a versão e a assinatura antigos;
 * caso contrário, troca o arquivo do mesmo documento.
 */
export async function substituirDocumentoHistorico(params: {
  rowId: string;
  companyId: string;
  filePathAtual?: string | null;
  file: File;
  patch?: SubstituirPatch;
  /** Descrição do documento para o log de alterações. */
  meta?: Omit<DocEventoMeta, "companyId">;
}): Promise<{ novaVersaoId?: string }> {
  const { rowId, companyId, filePathAtual, file, patch, meta } = params;
  const { source, id } = parseDocRowId(rowId);
  const cfg = CFG[source];

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const novoPath = `${companyId}/${id}/${Date.now()}.${ext}`;

  const up = await supabase.storage.from(cfg.bucket).upload(novoPath, file, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (up.error) throw up.error;

  if (source === "doc") {
    let resultado: SubstituirDocumentoResultado;
    try {
      resultado = await substituirDocumento(
        id,
        {
          file_path: novoPath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || "application/pdf",
        },
        {
          ...(patch?.colaborador_id !== undefined ? { colaborador_id: patch.colaborador_id } : {}),
          ...(patch?.tipo ? { tipo: patch.tipo } : {}),
          ...(patch?.competencia !== undefined ? { competencia: patch.competencia } : {}),
        },
        meta?.motivo ?? "Novo arquivo enviado pelo Histórico",
      );
    } catch (e) {
      await removerArquivo(cfg.bucket, novoPath);
      throw e;
    }

    await registrarEvento({
      rowId,
      acao: resultado.modo === "nova_versao" ? "nova_versao" : "substituido",
      meta: { ...(meta ?? {}), companyId },
      arquivo_anterior: filePathAtual,
      arquivo_novo: novoPath,
    });

    // O arquivo assinado permanece no acervo; só o substituído sem assinatura sai.
    if (resultado.modo === "substituido" && filePathAtual && filePathAtual !== novoPath) {
      await removerArquivo(cfg.bucket, filePathAtual);
    }

    return resultado.modo === "nova_versao"
      ? { novaVersaoId: resultado.documento_id }
      : {};
  }

  const update: Record<string, unknown> = { [cfg.pathCol]: novoPath };
  if (source === "sind") update.arquivo_nome = file.name;

  const { error } = await supabase.from(cfg.table as any).update(update).eq("id", id);
  if (error) {
    await removerArquivo(cfg.bucket, novoPath);
    throw error;
  }

  await registrarEvento({
    rowId,
    acao: "substituido",
    meta: { ...(meta ?? {}), companyId },
    arquivo_anterior: filePathAtual,
    arquivo_novo: novoPath,
  });

  if (filePathAtual && filePathAtual !== novoPath) {
    await removerArquivo(cfg.bucket, filePathAtual);
  }

  return {};
}

