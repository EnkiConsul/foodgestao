import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, PenLine, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DOCUMENTO_CONFIRMACAO_TEXTO } from "@/lib/dp/documento-titulo";
import { assinarDocumento } from "@/lib/dp/documentoAceite";
import { assinarTroca } from "@/lib/dp/troca-assinatura";
import { useLocation } from "react-router-dom";
import { TermoTrocaPreviewDialog } from "@/components/dp/trocas/TermoTrocaPreviewDialog";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import {
  useDocumentosAguardandoAssinatura,
  type DocParaAssinar,
} from "@/hooks/portal/useDocumentosAguardandoAssinatura";
import { notifyError } from "@/lib/notifyError";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";
import { AssinaturaConfirmarDialog } from "@/components/dp/portal/AssinaturaConfirmarDialog";

const BUCKET = "dp-documentos";
/** Se o colaborador fechar sem assinar, o aviso volta depois deste intervalo. */
export const REABRIR_APOS_MS = 10 * 60 * 1000;
/** Trava o portal (sem "Ver depois") a partir destes limites. */
export const TRAVA_DIAS_ATRASO = 7;
export const TRAVA_QTD_DOCUMENTOS = 2;

/**
 * Aviso global do portal: enquanto houver documento esperando assinatura,
 * o colaborador vê o aviso em qualquer tela. Fechar apenas adia por 10 minutos.
 */
export function DocumentoAssinaturaGate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const { colaborador, documentos } = useDocumentosAguardandoAssinatura();

  const [adiado, setAdiado] = useState(false);
  const [visualizou, setVisualizou] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocParaAssinar | null>(null);
  const [previewTroca, setPreviewTroca] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [assinaturaPng, setAssinaturaPng] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atual = documentos[0] ?? null;

  // Termo de troca: abre na própria janela do aviso, sem trocar de tela.
  const trocaAtual = useQuery({
    queryKey: ["dp_troca_termo_gate", atual?.troca_id],
    enabled: !!atual?.troca_id && previewTroca,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<DpTrocaRow | null> => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select(
          `*, solicitante:solicitante_id(nome, matricula, cargo_id, unidade_id, cargo:cargo_id(nome), unidade:unidade_id(nome)), destino:destino_id(nome, matricula, cargo_id, unidade_id, cargo:cargo_id(nome), unidade:unidade_id(nome))`,
        )
        .eq("id", atual!.troca_id!)
        .maybeSingle();
      if (error) throw error;
      return data ? ({ ...(data as any), modo: "direta" } as DpTrocaRow) : null;
    },
  });

  const empresaTermo = useQuery({
    queryKey: ["dp_minha_empresa_termo", colaborador?.company_id],
    enabled: !!colaborador?.company_id && previewTroca,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, trade_name")
        .eq("id", colaborador!.company_id!)
        .maybeSingle();
      return { nome: (data as any)?.name ?? (data as any)?.trade_name ?? "Empresa" };
    },
  });
  const diasAtraso = atual
    ? Math.floor((Date.now() - new Date(atual.created_at).getTime()) / 86_400_000)
    : 0;
  const bloqueado =
    documentos.length >= TRAVA_QTD_DOCUMENTOS || diasAtraso >= TRAVA_DIAS_ATRASO;
  // Na tela de trocas o termo é lido e assinado ali; o aviso não cobre a tela.
  const naTelaTroca = !!atual?.troca_id && pathname.startsWith("/dp/meu/trocas");
  const open = !!atual && !naTelaTroca && (bloqueado || !adiado);

  // Ao trocar de documento, exige nova visualização.
  useEffect(() => {
    if (atual && visualizou && visualizou !== atual.id) setVisualizou(null);
  }, [atual, visualizou]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const adiar = () => {
    if (bloqueado) return;
    setAdiado(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdiado(false), REABRIR_APOS_MS);
    toast.info("Você ainda precisa assinar este documento", {
      description: "Vamos lembrar você novamente em alguns minutos.",
    });
  };

  const assinar = useMutation({
    mutationFn: async ({ d, png }: { d: DocParaAssinar; png: string | null }) => {
      if (!colaborador) throw new Error("Colaborador não encontrado");
      if (!png) throw new Error("Desenhe ou escolha a sua assinatura.");
      if (d.troca_id) await assinarTroca(d.troca_id, png);
      else await assinarDocumento(d.id, png);
    },
    onSuccess: () => {
      toast.success("Documento assinado", {
        description: "Registramos data, hora e dispositivo da sua assinatura.",
      });
      setVisualizou(null);
      setAssinaturaPng(null);
      setConfirmar(false);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["dp_docs_aguardando_assinatura"] });
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias_colaborador"] });
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
      qc.invalidateQueries({ queryKey: ["dp_trocas"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Documentos", action: "concluir a ação", fallback: "Não foi possível registrar a assinatura" }),
  });

  if (!atual) return null;

  const podeAssinar = (!atual.file_path && !atual.troca_id) || visualizou === atual.id;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) adiar(); }}>
        <DialogContent
          className="w-[calc(100%-1rem)] max-w-md max-h-[92dvh] overflow-y-auto"
          hideClose={bloqueado}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" /> Documento para assinar
            </DialogTitle>
            <DialogDescription>
              {bloqueado
                ? "Sua assinatura é obrigatória para continuar usando o portal."
                : "Abra o documento, confira o conteúdo e assine para registrar sua ciência."}
            </DialogDescription>
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
                    {atual.troca_id ? atual.tipo_label : `${atual.tipo_label} · Competência ${atual.competencia_label}`}
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

            {bloqueado && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {documentos.length >= TRAVA_QTD_DOCUMENTOS
                  ? `Você tem ${documentos.length} documentos sem assinatura. Assine para continuar usando o portal.`
                  : `Este documento está há ${diasAtraso} dias sem assinatura. Assine para continuar usando o portal.`}
              </p>
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
              disabled={!atual.file_path && !atual.troca_id}
              onClick={() => {
                if (atual.troca_id) {
                  // O termo de troca abre em janela sobreposta, sem sair da tela.
                  setPreviewTroca(true);
                  setVisualizou(atual.id);
                  return;
                }
                setPreview(atual);
                setVisualizou(atual.id);
              }}
            >
              <Eye className="h-4 w-4 mr-1" /> Abrir documento
            </Button>

            {podeAssinar && (
              <AssinaturaCaptura
                key={atual.id}
                nomePadrao={String(colaborador?.nome_social || colaborador?.nome || "")}
                onChange={setAssinaturaPng}
              />
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full min-h-10"
              disabled={!podeAssinar || !assinaturaPng || assinar.isPending}
              onClick={() => assinar.mutate({ d: atual, png: assinaturaPng })}
            >
              <PenLine className="h-4 w-4 mr-1" /> Assinar documento
            </Button>
            {bloqueado ? (
              <p className="text-xs text-center text-muted-foreground">
                O portal fica liberado assim que você assinar os documentos pendentes.
              </p>
            ) : (
              <Button variant="ghost" className="w-full min-h-10" onClick={adiar}>
                Ver depois
              </Button>
            )}
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
        comprovanteDocumentoId={preview?.id ?? null}
        acaoRodape={
          <Button size="sm" className="ml-auto sm:ml-0 sm:order-last" onClick={() => setConfirmar(true)}>
            <PenLine className="h-4 w-4 mr-1" /> Assinar
          </Button>
        }
      />

      <AssinaturaConfirmarDialog
        open={confirmar && !!preview}
        onOpenChange={setConfirmar}
        titulo={preview?.titulo ?? ""}
        nome={String(colaborador?.nome_social || colaborador?.nome || "")}
        enviando={assinar.isPending}
        onConfirmar={(png) => preview && assinar.mutate({ d: preview, png })}
      />

    </>
  );
}
