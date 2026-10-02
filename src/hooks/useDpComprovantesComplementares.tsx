import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyError } from "@/lib/notifyError";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";
import { DP_DOCUMENTOS_BUCKET } from "@/lib/documentoArquivo";
import type { ComprovanteAlvo } from "@/hooks/useDpComprovantePagamento";
import type { ComprovanteQuitacao } from "@/lib/dp/documentos-oficial";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";

export type ComprovanteComplementar = {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  pago_em: string;
  modalidade: string;
  valor_bancario_cents: number | null;
  valor_especie_cents: number | null;
  created_at: string;
};

/** Comprovantes complementares (2º, 3º...) do documento. Só lê o que já foi gravado. */
export function useComprovantesComplementares(documentoId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["dp_doc_comprovantes", documentoId],
    enabled: enabled && !!documentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documento_comprovantes" as never)
        .select("id,file_path,file_name,mime_type,pago_em,modalidade,valor_bancario_cents,valor_especie_cents,created_at")
        .eq("documento_id", documentoId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as ComprovanteComplementar[];
    },
  });
}

export async function linkComplementar(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export function useDpComprovanteComplementarAcoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["dp_doc_comprovantes"] });
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_doc_detalhes"] });
    qc.invalidateQueries({ queryKey: ["dp_historico_documentos"] });
    void resolverPendencias(qc, { companyId: selectedCompanyId });
  };

  const adicionar = useMutation({
    mutationFn: async (p: { alvo: ComprovanteAlvo; file: File; pagoEm: string; quitacao: ComprovanteQuitacao }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const file = await prepararUpload(DP_DOCUMENTOS_BUCKET, p.file);
      const path = `${selectedCompanyId}/${p.alvo.colaboradorId ?? "geral"}/comprovantes/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      const up = await supabase.storage.from(DP_DOCUMENTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.rpc("dp_comprovante_adicionar" as never, {
        p_documento_id: p.alvo.documentoId,
        p_arquivo: { file_path: path, file_name: file.name, file_size: file.size, mime_type: file.type },
        p_pago_em: p.pagoEm,
        p_modalidade: p.quitacao.modalidade,
        p_valor_bancario_cents: p.quitacao.valorBancarioCents ?? null,
        p_valor_especie_cents: p.quitacao.valorEspecieCents ?? null,
        p_leitura: p.quitacao.leitura ?? null,
      } as never);
      if (error) {
        await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Comprovante complementar anexado");
      invalidar();
    },
    onError: (e) => notifyError(e, { surface: "Documentos", action: "anexar o comprovante complementar", fallback: "Erro" }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("dp_comprovante_excluir" as never, { p_comprovante_id: id } as never);
      if (error) throw error;
      const path = data as unknown as string | null;
      if (path) await supabase.storage.from(DP_DOCUMENTOS_BUCKET).remove([path]);
    },
    onSuccess: () => {
      toast.success("Comprovante complementar removido");
      invalidar();
    },
    onError: (e) => notifyError(e, { surface: "Documentos", action: "remover o comprovante complementar", fallback: "Erro" }),
  });

  return { adicionar, excluir, ocupado: adicionar.isPending || excluir.isPending };
}
