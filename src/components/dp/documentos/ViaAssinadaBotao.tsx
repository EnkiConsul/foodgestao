import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { comRetentativa, prepararUpload } from "@/lib/storage/uploadPolicy";
import { sanitizeStorageFilename } from "@/lib/storage";
import { DP_DOCUMENTOS_BUCKET } from "@/lib/documentoArquivo";
import { notifyError } from "@/lib/notifyError";
import { cn } from "@/lib/utils";
import { acionarInput, useConferenciaDigitalizacao } from "./ConferenciaDigitalizacao";

/**
 * Anexa (ou substitui) a via assinada em papel de um documento de assinatura
 * física. O arquivo original sem assinatura é preservado.
 */
export function ViaAssinadaBotao({
  documentoId,
  companyId,
  colaboradorId,
  temVia,
  rotulo,
  className,
  onDone,
}: {
  documentoId: string;
  companyId: string | null;
  colaboradorId: string | null;
  temVia: boolean;
  rotulo?: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { abrirSeletor, conferir, dialogo } = useConferenciaDigitalizacao({
    onSelecionarArquivo: (modo) => acionarInput(ref.current, modo),
    onTirarOutra: () => acionarInput(ref.current, "camera"),
  });

  const anexar = useMutation({
    mutationFn: async (escolhido: File) => {
      if (!companyId) throw new Error("Empresa não selecionada");
      const file = await prepararUpload(DP_DOCUMENTOS_BUCKET, escolhido);
      const path = `${companyId}/${colaboradorId ?? "geral"}/vias-assinadas/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
      await comRetentativa(async () => {
        const up = await supabase.storage
          .from(DP_DOCUMENTOS_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: true });
        if (up.error) throw up.error;
      });
      const { error } = await (supabase.rpc as any)(
        "dp_documento_anexar_via_assinada",
        {
          _documento_id: documentoId,
          _file_path: path,
          _file_name: file.name,
          _mime_type: file.type,
        },
      );
      if (error) {
        await supabase.storage
          .from(DP_DOCUMENTOS_BUCKET)
          .remove([path])
          .catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(
        temVia ? "Via assinada substituída" : "Via assinada anexada",
      );
      qc.invalidateQueries({ queryKey: ["dp_historico_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      onDone?.();
    },
    onError: (e) =>
      notifyError(e, {
        surface: "Documentos",
        action: "anexar a via assinada",
        fallback: "Erro",
      }),
  });

  const titulo = temVia ? "Substituir Via Assinada" : "Importar Via Assinada";
  return (
    <>
      {dialogo}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void conferir(f).then((ok) => ok && anexar.mutate(ok));
        }}
      />
      <Button
        type="button"
        size={rotulo ? "sm" : "icon"}
        variant="ghost"
        aria-label={titulo}
        title={titulo}
        className={cn(className)}
        disabled={anexar.isPending}
        onClick={abrirSeletor}
      >
        {anexar.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileCheck2
            className={cn(
              "h-4 w-4",
              temVia ? "text-emerald-600" : "text-primary",
              rotulo && "mr-1",
            )}
          />
        )}
        {rotulo && (temVia ? "Via assinada" : "Via assinada")}
      </Button>
    </>
  );
}
