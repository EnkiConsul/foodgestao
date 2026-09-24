import { useMutation, useQueryClient } from "@tanstack/react-query";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyError } from "@/lib/notifyError";
import { DP_DOCUMENTOS_BUCKET } from "@/lib/documentoArquivo";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { anexarComprovante, removerComprovante } from "@/lib/dp/documentos-oficial";

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
      file: escolhido,
      pagoEm,
      confirmarCompetencia,
    }: {
      alvo: ComprovanteAlvo;
      file: File;
      pagoEm?: string | null;
      /** Pagamento em mês diferente da competência, já confirmado na tela. */
      confirmarCompetencia?: boolean;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      // A primeira pasta precisa ser a empresa: as regras de acesso do
      // repositório leem esse trecho como identificador da empresa.
      const path = `${selectedCompanyId}/${alvo.colaboradorId ?? "geral"}/comprovantes/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      validarUpload(DP_DOCUMENTOS_BUCKET, file);
      const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;

      // O servidor confere a empresa do arquivo e a data do pagamento, e
      // devolve o caminho do comprovante anterior para ser apagado depois.
      let anterior: string | null = null;
      try {
        anterior = await anexarComprovante(
          alvo.documentoId,
          {
            file_path: path,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
          },
          pagoEm || null,
          confirmarCompetencia === true,
        );
      } catch (e) {
        await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([path]);
        throw e;
      }

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
      const anterior = await removerComprovante(alvo.documentoId);
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
