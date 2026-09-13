import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, PenLine, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DOCUMENTO_CONFIRMACAO_TEXTO } from "@/lib/dp/documento-titulo";
import {
import { notifyError } from "@/lib/notifyError";
  useDocumentosAguardandoAssinatura,
  type DocParaAssinar,
} from "@/hooks/portal/useDocumentosAguardandoAssinatura";

const BUCKET = "dp-documentos";
/** Se o colaborador fechar sem assinar, o aviso volta depois deste intervalo. */
export const REABRIR_APOS_MS = 10 * 60 * 1000;

/**
 * Aviso global do portal: enquanto houver documento esperando assinatura,
 * o colaborador vê o aviso em qualquer tela. Fechar apenas adia por 10 minutos.
 */
export function DocumentoAssinaturaGate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { colaborador, documentos } = useDocumentosAguardandoAssinatura();

  const [adiado, setAdiado] = useState(false);
  const [visualizou, setVisualizou] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocParaAssinar | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atual = documentos[0] ?? null;
  const open = !!atual && !adiado;

  // Ao trocar de documento, exige nova visualização.
  useEffect(() => {
    if (atual && visualizou && visualizou !== atual.id) setVisualizou(null);
  }, [atual, visualizou]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const adiar = () => {
    setAdiado(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdiado(false), REABRIR_APOS_MS);
    toast.info("Você ainda precisa assinar este documento", {
      description: "Vamos lembrar você novamente em alguns minutos.",
    });
  };

  const assinar = useMutation({
    mutationFn: async (d: DocParaAssinar) => {
      if (!colaborador) throw new Error("Colaborador não encontrado");
      const { error } = await supabase.from("dp_documento_aceites").insert({
        company_id: colaborador.company_id,
        colaborador_id: colaborador.id,
        documento_id: d.id,
        modelo: d.tipo,
        modelo_versao: "documento",
        conteudo_hash: d.file_path ?? d.id,
        aceito_por: user?.id ?? null,
        user_agent: navigator.userAgent.slice(0, 500),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento assinado", {
        description: "Registramos data, hora e dispositivo da sua assinatura.",
      });
      setVisualizou(null);
      qc.invalidateQueries({ queryKey: ["dp_docs_aguardando_assinatura"] });
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias_colaborador"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Documentos", action: "concluir a ação", fallback: "Não foi possível registrar a assinatura" }),
  });

  if (!atual) return null;

  const podeAssinar = !atual.file_path || visualizou === atual.id;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) adiar(); }}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" /> Documento para assinar
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium break-words">{atual.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {atual.tipo_label} · Competência {atual.competencia_label}
                  </p>
                </div>
              </div>
            </div>

            {documentos.length > 1 && (
              <Badge variant="outline" className="text-[11px]">
                <Clock className="h-3 w-3 mr-1" />
                {documentos.length} documentos esperando sua assinatura
              </Badge>
            )}

            <p className="text-xs text-muted-foreground">{DOCUMENTO_CONFIRMACAO_TEXTO}</p>

            {!podeAssinar && (
              <p className="text-xs text-amber-700">
                Abra o documento para liberar a assinatura.
              </p>
            )}

            <Button
              variant="outline"
              className="w-full min-h-10"
              disabled={!atual.file_path}
              onClick={() => {
                setPreview(atual);
                setVisualizou(atual.id);
              }}
            >
              <Eye className="h-4 w-4 mr-1" /> Abrir documento
            </Button>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full min-h-10"
              disabled={!podeAssinar || assinar.isPending}
              onClick={() => assinar.mutate(atual)}
            >
              <PenLine className="h-4 w-4 mr-1" /> Assinar documento
            </Button>
            <Button variant="ghost" className="w-full min-h-10" onClick={adiar}>
              Ver depois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket={BUCKET}
        path={preview?.file_path ?? null}
        mime={preview?.mime_type ?? null}
      />
    </>
  );
}
