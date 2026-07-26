import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type DpDocumentoTipo = Database["public"]["Enums"]["dp_documento_tipo"];
export type DpDocumentoAprov = "pendente" | "aprovado" | "recusado";
export type DpDocumentoRow = Database["public"]["Tables"]["dp_documentos"]["Row"] & {
  dp_colaboradores?: { nome: string } | null;
};

export const DP_DOCUMENTOS_BUCKET = "dp-documentos";

export type DpDocumentosFilters = {
  statusFilter: DpDocumentoAprov | "todos";
  search: string;
  periodoInicio: string;
  periodoFim: string;
};

export type EnviarDocumentosInput = {
  files: File[];
  colaborador_id: string;
  tipo: DpDocumentoTipo;
  titulo: string;
  descricao: string;
  referencia_data: string;
};

/**
 * Dados, filtros e mutations da tela de Documentos (DP).
 */
export function useDpDocumentos(filterTipo: DpDocumentoTipo | undefined, filters: DpDocumentosFilters) {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["dp_documentos", selectedCompanyId, filterTipo ?? "all"],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_documentos")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (filterTipo) q = q.eq("tipo", filterTipo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DpDocumentoRow[];
    },
  });

  const invalidateDocs = () => {
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
    qc.invalidateQueries({ queryKey: ["dp_doc_counts"] });
  };

  const { statusFilter, search, periodoInicio, periodoFim } = filters;

  const filteredRows = useMemo(() => {
    const all = list.data ?? [];
    const s = search.toLowerCase();
    return all.filter((r) => {
      if (statusFilter !== "todos" && (r as any).aprovacao_status !== statusFilter) return false;
      if (s) {
        const hay = `${r.titulo ?? ""} ${r.descricao ?? ""} ${r.dp_colaboradores?.nome ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (periodoInicio && r.referencia_data && r.referencia_data < periodoInicio) return false;
      if (periodoFim && r.referencia_data && r.referencia_data > periodoFim) return false;
      return true;
    });
  }, [list.data, statusFilter, search, periodoInicio, periodoFim]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: list.data?.length ?? 0, pendente: 0, aprovado: 0, recusado: 0 };
    for (const r of list.data ?? []) {
      const st = (r as any).aprovacao_status as string;
      c[st] = (c[st] ?? 0) + 1;
    }
    return c;
  }, [list.data]);

  /** Faz upload dos arquivos e cria os registros. Retorna a quantidade enviada. */
  const enviar = async ({ files, colaborador_id, tipo, titulo, descricao, referencia_data }: EnviarDocumentosInput) => {
    if (!selectedCompanyId) throw new Error("Sem empresa selecionada");
    let ok = 0;
    for (const file of files) {
      const path = `${selectedCompanyId}/${colaborador_id || "geral"}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      const tituloFinal = files.length > 1 ? file.name.replace(/\.[^.]+$/, "") : titulo.trim();
      const { error } = await supabase.from("dp_documentos").insert({
        company_id: selectedCompanyId,
        colaborador_id: colaborador_id || null,
        tipo,
        titulo: tituloFinal,
        descricao: descricao.trim() || null,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        referencia_data: referencia_data || null,
        uploaded_by: user?.id,
      });
      if (error) throw error;
      ok++;
    }
    invalidateDocs();
    return ok;
  };

  /** Gera link assinado e dispara o download (compatível com iOS Safari). */
  const download = async (row: DpDocumentoRow) => {
    const { data, error } = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).createSignedUrl(row.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = row.file_name ?? "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const remover = useMutation({
    mutationFn: async (row: DpDocumentoRow) => {
      await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([row.file_path]);
      const { error } = await supabase.from("dp_documentos").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      invalidateDocs();
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const aprovar = useMutation({
    mutationFn: async (row: DpDocumentoRow) => {
      const { error } = await supabase.from("dp_documentos").update({
        aprovacao_status: "aprovado",
        revisado_por: user?.id,
        revisado_em: new Date().toISOString(),
        motivo_recusao: null,
      } as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento aprovado");
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const recusar = useMutation({
    mutationFn: async ({ row, motivo }: { row: DpDocumentoRow; motivo: string }) => {
      const { error } = await supabase.from("dp_documentos").update({
        aprovacao_status: "recusado",
        revisado_por: user?.id,
        revisado_em: new Date().toISOString(),
        motivo_recusao: motivo,
      } as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento recusado");
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return {
    isLoading: list.isLoading,
    rows: list.data ?? [],
    filteredRows,
    counts,
    enviar,
    download,
    remover,
    aprovar,
    recusar,
  };
}
