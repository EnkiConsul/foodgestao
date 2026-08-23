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

/** Remove o arquivo do armazenamento, ignorando falhas de arquivo inexistente. */
async function removerArquivo(bucket: string, path?: string | null) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

/**
 * Exclui definitivamente o documento e seu arquivo.
 * Para o acervo do DP, os aceites eletrônicos vinculados também são removidos,
 * de modo que a pendência do documento volte a aparecer na Conferência.
 */
export async function excluirDocumentoHistorico(rowId: string, filePath?: string | null) {
  const { source, id } = parseDocRowId(rowId);
  const cfg = CFG[source];

  if (source === "doc") {
    const del = await supabase.from("dp_documento_aceites").delete().eq("documento_id", id);
    if (del.error) throw del.error;
  }

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
 * Substitui o arquivo de um documento já registrado, mantendo o histórico no
 * mesmo lugar. Aceites anteriores são invalidados, pois o conteúdo mudou.
 */
export async function substituirDocumentoHistorico(params: {
  rowId: string;
  companyId: string;
  filePathAtual?: string | null;
  file: File;
  patch?: SubstituirPatch;
}) {
  const { rowId, companyId, filePathAtual, file, patch } = params;
  const { source, id } = parseDocRowId(rowId);
  const cfg = CFG[source];

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const novoPath = `${companyId}/${id}/${Date.now()}.${ext}`;

  const up = await supabase.storage.from(cfg.bucket).upload(novoPath, file, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (up.error) throw up.error;

  const update: Record<string, unknown> = { [cfg.pathCol]: novoPath };

  if (source === "doc") {
    update.file_name = file.name;
    update.file_size = file.size;
    update.mime_type = file.type || "application/pdf";
    if (patch?.colaborador_id !== undefined) update.colaborador_id = patch.colaborador_id;
    if (patch?.tipo) update.tipo = patch.tipo;
    if (patch?.competencia !== undefined) {
      update.referencia_data = patch.competencia ? `${patch.competencia}-01` : null;
    }
  } else if (source === "sind") {
    update.arquivo_nome = file.name;
  }

  const { error } = await supabase.from(cfg.table as any).update(update).eq("id", id);
  if (error) {
    await removerArquivo(cfg.bucket, novoPath);
    throw error;
  }

  if (source === "doc") {
    // Conteúdo novo exige nova validação digital do colaborador.
    await supabase.from("dp_documento_aceites").delete().eq("documento_id", id);
  }

  if (filePathAtual && filePathAtual !== novoPath) {
    await removerArquivo(cfg.bucket, filePathAtual);
  }
}
