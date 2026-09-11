import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { textoErroFerias } from "@/lib/dp/ferias-direito";
import { DP_DOCUMENTOS_BUCKET } from "@/hooks/useDpDocumentos";

export type FeriasDocTipo = "aviso_ferias" | "recibo_ferias";

export type FeriasDocumento = {
  id: string;
  ferias_gozo_id: string | null;
  colaborador_id: string | null;
  tipo: FeriasDocTipo;
  titulo: string;
  file_path: string;
  file_name: string | null;
  created_at: string;
};

export const FERIAS_DOC_LABEL: Record<FeriasDocTipo, string> = {
  aviso_ferias: "Aviso de férias",
  recibo_ferias: "Recibo de férias",
};

export type AnexarFeriasDocInput = {
  gozoId: string;
  colaboradorId: string;
  tipo: FeriasDocTipo;
  referenciaData: string;
  file: File;
};

export type RegistrarAvisoInput = {
  gozoId: string;
  avisoEm: string;
  retroativo: boolean;
  justificativa?: string | null;
  documentoId?: string | null;
};

/**
 * Anexos das férias (aviso e recibo) e registro do aviso legal. Os arquivos são
 * gravados como documentos do colaborador, então também aparecem no histórico
 * de documentos e no portal.
 */
export function useDpFeriasDocumentos() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ferias_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_ferias_gozos"] });
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_ferias_minhas"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const listQ = useQuery({
    queryKey: ["dp_ferias_documentos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<FeriasDocumento[]> => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("id, ferias_gozo_id, colaborador_id, tipo, titulo, file_path, file_name, created_at")
        .eq("company_id", selectedCompanyId!)
        .not("ferias_gozo_id", "is", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeriasDocumento[];
    },
  });

  /** Anexos por férias: { [gozoId]: { aviso_ferias: [...], recibo_ferias: [...] } } */
  const porGozo = useMemo(() => {
    const map = new Map<string, Record<FeriasDocTipo, FeriasDocumento[]>>();
    for (const doc of listQ.data ?? []) {
      if (!doc.ferias_gozo_id) continue;
      if (!map.has(doc.ferias_gozo_id)) {
        map.set(doc.ferias_gozo_id, { aviso_ferias: [], recibo_ferias: [] });
      }
      const bucket = map.get(doc.ferias_gozo_id)!;
      if (doc.tipo === "aviso_ferias" || doc.tipo === "recibo_ferias") bucket[doc.tipo].push(doc);
    }
    return map;
  }, [listQ.data]);

  /** Faz upload e grava o documento ligado às férias. Retorna o id criado. */
  const anexar = useMutation({
    mutationFn: async (input: AnexarFeriasDocInput): Promise<string> => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { gozoId, colaboradorId, tipo, referenciaData, file } = input;
      const path = `${selectedCompanyId}/${colaboradorId || "geral"}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from("dp_documentos")
        .insert({
          company_id: selectedCompanyId,
          colaborador_id: colaboradorId || null,
          ferias_gozo_id: gozoId,
          tipo,
          titulo: FERIAS_DOC_LABEL[tipo],
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          referencia_data: referenciaData || null,
          uploaded_by: user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: () => {
      toast.success("Documento anexado às férias");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao anexar documento"),
  });

  const excluir = useMutation({
    mutationFn: async (doc: FeriasDocumento) => {
      await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([doc.file_path]);
      const { error } = await supabase.from("dp_documentos").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover documento"),
  });

  /** Abre o arquivo em nova aba com link temporário. */
  const abrir = async (doc: FeriasDocumento) => {
    const { data, error } = await supabase.storage
      .from(DP_DOCUMENTOS_BUCKET)
      .createSignedUrl(doc.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar link do arquivo");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const registrarAviso = useMutation({
    mutationFn: async (input: RegistrarAvisoInput) => {
      const { error } = await supabase.rpc("dp_ferias_registrar_aviso", {
        _gozo_id: input.gozoId,
        _aviso_em: input.avisoEm,
        _retroativo: input.retroativo,
        _justificativa: input.justificativa?.trim() || null,
        _documento_id: input.documentoId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso de férias registrado");
      invalidate();
    },
    onError: (e: any) => toast.error(textoErroFerias(e?.message)),
  });

  return {
    isLoading: listQ.isLoading,
    documentos: listQ.data ?? [],
    porGozo,
    docsDoGozo: (gozoId: string) =>
      porGozo.get(gozoId) ?? { aviso_ferias: [], recibo_ferias: [] },
    anexar,
    excluir,
    abrir,
    registrarAviso,
  };
}
