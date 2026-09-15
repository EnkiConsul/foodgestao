import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyError } from "@/lib/notifyError";
import { DP_DOCUMENTOS_BUCKET } from "@/lib/documentoArquivo";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";

export type ComprovanteAlvo = {
  /** Id do documento em dp_documentos. */
  documentoId: string;
  colaboradorId: string | null;
  tipo: string;
};

/**
 * Comprovante de pagamento: segundo arquivo do documento, gravado somente por
 * quem administra a empresa. O colaborador apenas visualiza.
 */
export function useDpComprovantePagamento() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_doc_detalhes"] });
    qc.invalidateQueries({ queryKey: ["dp_historico_documentos"] });
    qc.invalidateQueries({ queryKey: ["meus_documentos"] });
    void resolverPendencias(qc, { companyId: selectedCompanyId });
  };

  const anexar = useMutation({
    mutationFn: async ({
      alvo,
      file,
      pagoEm,
    }: {
      alvo: ComprovanteAlvo;
      file: File;
      pagoEm?: string | null;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const path = `comprovantes/${selectedCompanyId}/${alvo.colaboradorId ?? "geral"}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;

      // Guarda o caminho anterior para apagar somente depois de gravar o novo.
      const { data: atual } = await supabase
        .from("dp_documentos")
        .select("comprovante_file_path")
        .eq("id", alvo.documentoId)
        .maybeSingle();

      const { error } = await supabase
        .from("dp_documentos")
        .update({
          comprovante_file_path: path,
          comprovante_file_name: file.name,
          comprovante_file_size: file.size,
          comprovante_mime_type: file.type,
          comprovante_pago_em: pagoEm || null,
          comprovante_uploaded_by: user?.id ?? null,
        } as never)
        .eq("id", alvo.documentoId);
      if (error) {
        await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([path]);
        throw error;
      }

      const anterior = (atual as { comprovante_file_path?: string | null } | null)?.comprovante_file_path;
      if (anterior && anterior !== path) {
        await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([anterior]);
      }
    },
    onSuccess: () => {
      toast.success("Comprovante de pagamento anexado");
      invalidar();
    },
    onError: (e) =>
      notifyError(e, { surface: "Documentos", action: "anexar o comprovante", fallback: "Erro" }),
  });

  const remover = useMutation({
    mutationFn: async (alvo: ComprovanteAlvo) => {
      const { data: atual } = await supabase
        .from("dp_documentos")
        .select("comprovante_file_path")
        .eq("id", alvo.documentoId)
        .maybeSingle();
      const { error } = await supabase
        .from("dp_documentos")
        .update({ comprovante_file_path: null } as never)
        .eq("id", alvo.documentoId);
      if (error) throw error;
      const anterior = (atual as { comprovante_file_path?: string | null } | null)?.comprovante_file_path;
      if (anterior) await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([anterior]);
    },
    onSuccess: () => {
      toast.success("Comprovante removido");
      invalidar();
    },
    onError: (e) =>
      notifyError(e, { surface: "Documentos", action: "remover o comprovante", fallback: "Erro" }),
  });

  return { anexar, remover, ocupado: anexar.isPending || remover.isPending };
}
