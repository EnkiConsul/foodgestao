import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DOCUMENTO_CONFIRMACAO_TEXTO } from "@/lib/dp/documento-titulo";
import { assinarDocumento } from "@/lib/dp/documentoAceite";
import { assinarTroca } from "@/lib/dp/troca-assinatura";
import { useLocation } from "react-router-dom";
import { termoTrocaHtml } from "@/lib/dp/troca-certificado";
import { completarPartesTrocas } from "@/lib/dp/troca-partes";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import {
  useDocumentosAguardandoAssinatura,
  type DocParaAssinar,
} from "@/hooks/portal/useDocumentosAguardandoAssinatura";
import { notifyError } from "@/lib/notifyError";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";
import { DocumentoAssinarViewer } from "@/components/dp/portal/DocumentoAssinarViewer";

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
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const { colaborador, documentos } = useDocumentosAguardandoAssinatura();

  const [adiado, setAdiado] = useState(false);
  /** Documento com arquivo aberto na tela cheia de leitura e assinatura. */
  const [assinandoDoc, setAssinandoDoc] = useState<DocParaAssinar | null>(null);
  const [previewTroca, setPreviewTroca] = useState(false);
  const [assinaturaPng, setAssinaturaPng] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atual = documentos[0] ?? null;

  // Termo de troca: abre na própria janela do aviso, sem trocar de tela.
  // Buscado já na abertura do aviso para mostrar o nome da outra parte no cartão.
  const trocaAtual = useQuery({
    queryKey: ["dp_troca_termo_gate", atual?.troca_id],
    enabled: !!atual?.troca_id,
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
      if (!data) return null;
      // O colaborador não lê o cadastro do colega (dados sigilosos): os nomes
      // e cargos das duas partes vêm da rotina segura dp_portal_trocas_partes.
      const [completa] = await completarPartesTrocas([data as any]);
      return { ...(completa as any), modo: "direta" } as DpTrocaRow;
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
  // CPF é sigiloso: vem da rotina segura, só para as partes da troca.
  const cpfsTermo = useQuery({
    queryKey: ["dp_troca_termo_cpfs", atual?.troca_id],
    enabled: !!atual?.troca_id && previewTroca,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("dp_troca_termo_cpfs", { _troca_id: atual!.troca_id! });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as { solicitante_cpf: string | null; destino_cpf: string | null } | null;
    },
  });
  const termoHtml = (() => {
    const t = trocaAtual.data;
    if (!previewTroca || !t) return "";
    const c = cpfsTermo.data;
    return termoTrocaHtml(
      {
        ...t,
        solicitante: t.solicitante ? { ...t.solicitante, cpf: c?.solicitante_cpf ?? null } : null,
        destino: t.destino ? { ...t.destino, cpf: c?.destino_cpf ?? null } : null,
      } as DpTrocaRow,
      empresaTermo.data ?? { nome: "Empresa" },
      { manual: false },
    );
  })();

  const diasAtraso = atual
    ? Math.floor((Date.now() - new Date(atual.created_at).getTime()) / 86_400_000)
    : 0;
  const bloqueado =
    documentos.length >= TRAVA_QTD_DOCUMENTOS || diasAtraso >= TRAVA_DIAS_ATRASO;
  // Na tela de trocas o termo é lido e assinado ali; o aviso não cobre a tela.
  const naTelaTroca = !!atual?.troca_id && pathname.startsWith("/dp/meu/trocas");
  const open = !!atual && !naTelaTroca && (bloqueado || !adiado);

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
      setAssinaturaPng(null);
      setAssinandoDoc(null);
      setPreviewTroca(false);
      qc.invalidateQueries({ queryKey: ["dp_docs_aguardando_assinatura"] });
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias_colaborador"] });
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
      qc.invalidateQueries({ queryKey: ["dp_trocas"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Documentos", action: "concluir a ação", fallback: "Não foi possível registrar a assinatura" }),
  });

  if (!atual) return null;

  // Nome da outra parte da troca, para o colaborador reconhecer o termo no cartão.
  const troca = trocaAtual.data;
  const outraParte =
    atual.troca_id && troca
      ? (troca.solicitante_id === colaborador?.id ? troca.destino?.nome : troca.solicitante?.nome) ?? null
      : null;

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
                    {atual.troca_id
                      ? outraParte
                        ? `Troca de folga com ${outraParte}`
                        : atual.tipo_label
                      : `${atual.tipo_label} · Competência ${atual.competencia_label}`}
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

            {atual.troca_id ? (
              <>
                <Button
                  variant="outline"
                  className="w-full min-h-10"
                  onClick={() => setPreviewTroca((v) => !v)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  {previewTroca ? "Recolher termo" : "Ler o termo"}
                </Button>

                {previewTroca && (
                  <div className="h-[50dvh] overflow-hidden rounded-lg border bg-background">
                    {trocaAtual.isLoading || cpfsTermo.isLoading ? (
                      <p className="p-3 text-xs text-muted-foreground">Carregando o termo…</p>
                    ) : trocaAtual.isError || !trocaAtual.data ? (
                      <p className="p-3 text-xs text-destructive">Não conseguimos abrir o termo agora. Toque em "Ler o termo" de novo; se continuar, fale com o seu gestor.</p>
                    ) : (
                      <iframe title="Termo de Troca de Folga" srcDoc={termoHtml} sandbox="" className="h-full w-full bg-white" />
                    )}
                  </div>
                )}

                {/* O termo de troca é uma página única: assina aqui mesmo, sem rubrica. */}
                <AssinaturaCaptura
                  key={atual.id}
                  nomePadrao={String(colaborador?.nome || "")}
                  onChange={setAssinaturaPng}
                />
                <Button
                  className="w-full min-h-10"
                  disabled={!assinaturaPng || assinar.isPending}
                  onClick={() => assinar.mutate({ d: atual, png: assinaturaPng })}
                >
                  <PenLine className="h-4 w-4 mr-1" /> Assinar termo
                </Button>
              </>
            ) : (
              // Documento com arquivo: um único botão abre a tela cheia de
              // leitura, rubrica página a página e assinatura. Nada de botão
              // travado esperando a visualização.
              <Button className="w-full min-h-11" onClick={() => setAssinandoDoc(atual)}>
                <PenLine className="h-4 w-4 mr-1" /> Visualizar e Assinar
              </Button>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
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

      <DocumentoAssinarViewer
        open={!!assinandoDoc}
        onOpenChange={(v) => { if (!v) setAssinandoDoc(null); }}
        titulo={assinandoDoc?.titulo ?? ""}
        filePath={assinandoDoc?.file_path ?? null}
        fileName={assinandoDoc?.file_name ?? null}
        mimeType={assinandoDoc?.mime_type ?? null}
        nomeColaborador={String(colaborador?.nome || "")}
        enviando={assinar.isPending}
        onConcluir={(png) => assinandoDoc && assinar.mutate({ d: assinandoDoc, png })}
      />
    </>
  );
}
