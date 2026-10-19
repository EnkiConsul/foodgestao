import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, FileText, History, Info, ListChecks, Loader2, Upload, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { ImportarDocumentoDialog } from "@/components/dp/documentos/ImportarDocumentoDialog";
import { documentPendenciasState } from "@/components/dp/documentos/documentPendenciasState";
import { PendenciaAcoes } from "@/components/dp/pendencias/PendenciaAcoes";
import { docTipoLabel } from "@/lib/dp/documentoTipos";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { compararUrgencia, filtrarAbertas, isDocumentoPendencia, urgenciaDe } from "@/lib/dp/pendencias";
import { useStablePendencias, UrgenciaBadge } from "@/components/dp/home/PendenciasCard";
import DpHistoricoCompleto from "@/pages/dp/DpHistoricoCompleto";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function competenciaLabel(comp: string | null) {
  if (!comp) return null;
  const [ano, mes] = comp.split("-");
  const idx = Number(mes) - 1;
  if (!ano || idx < 0 || idx > 11) return null;
  return `${MESES[idx]}/${ano}`;
}

const dataBR = (d: string) => new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");

/**
 * Resumo das pendências de documentos (mesmo motor das Ações do Dia da tela
 * inicial, filtrado para documentos). O clique abre uma gaveta na própria
 * tela — sem navegar para fora — com as ações e os botões de resolução.
 */
export function AcoesDocumentosCard({ onImportar, onHistorico }: { onImportar?: () => void; onHistorico?: () => void } = {}) {
  const { selectedCompanyId } = useCompanyContext();
  const pendencias = useDpPendencias();
  const { data, isLoading, isFetching, isRefreshing, isError, refetch, dataUpdatedAt, lastCalculatedAt } = pendencias;
  const stable = useStablePendencias({ companyId: selectedCompanyId, data, dataUpdatedAt, lastCalculatedAt, isLoading, isFetching });
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas } = useDpPendenciasDecisoes();
  const isMobile = useIsMobile();
  const [aberto, setAberto] = useState(false);

  const abertas = useMemo(
    () =>
      filtrarAbertas(
        stable.data.filter((p) => !ignoradas.has(p.id) && isDocumentoPendencia(p)),
        { ...prefs.pendencias_adiadas, ...adiadas },
      ).slice().sort(compararUrgencia),
    [stable.data, prefs.pendencias_adiadas, ignoradas, adiadas],
  );
  const atrasadas = abertas.filter((p) => urgenciaDe(p) === "atrasada").length;
  const { atualizando, falhou, carregando, podeConfirmarVazio } = documentPendenciasState({
    ready: stable.ready, isLoading, isFetching, isRefreshing, isError,
  });

  const resumo = falhou
    ? "Falha ao atualizar"
    : carregando
    ? "Carregando…"
    : atualizando && abertas.length === 0
      ? "Atualizando…"
    : abertas.length === 0
      ? "Tudo em dia"
      : [
          `${abertas.length} ${abertas.length === 1 ? "documento pendente" : "documentos pendentes"}`,
          atrasadas > 0 && `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`,
        ]
          .filter(Boolean)
          .join(" · ");

  const lista = (
    <ul className="space-y-2">
      {abertas.map((p) => {
        const u = urgenciaDe(p);
        return (
          <li
            key={p.id}
            className="relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 pl-4"
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 w-1",
                u === "atrasada" || u === "urgente" ? "bg-destructive" : u === "hoje" ? "bg-warning" : "bg-border",
              )}
              aria-hidden="true"
            />
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <p.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold leading-snug">{p.titulo}</p>
                <UrgenciaBadge atrasoDias={p.atrasoDias} urgente={p.urgente} />
              </div>
              <p className="break-words text-xs leading-relaxed text-muted-foreground">{p.subtitulo}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">{p.tipo}</span>
                {(p.colaboradorNome ?? p.unidadeNome) && <span className="truncate">{p.colaboradorNome ?? p.unidadeNome}</span>}
                {p.vencimento && <span>Prazo {dataBR(p.vencimento)}</span>}
              </div>
              <PendenciaAcoes pendencia={p} onNavigate={() => setAberto(false)} />
            </div>
          </li>
        );
      })}
    </ul>
  );

  const vazio = (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
      <p className="text-base font-semibold">Documentos em dia!</p>
      <p className="text-sm text-muted-foreground">Nenhuma pendência de documentos na empresa.</p>
    </div>
  );

  const descricao = falhou
    ? "Não foi possível conferir as pendências. Tente novamente."
    : carregando || atualizando
      ? "Conferindo as pendências de documentos…"
      : abertas.length === 0
        ? "Nada pendente no momento."
        : `${abertas.length} ${abertas.length === 1 ? "ação aberta" : "ações abertas"}${atrasadas > 0 ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}`;

  const conteudo = (
    <div className="space-y-3">
      {falhou ? (
        <DpErrorState
          message={stable.ready && abertas.length > 0
            ? "A lista abaixo é da última consulta confirmada. Tente novamente para conferir as pendências atuais."
            : "Não foi possível conferir as pendências de documentos. Tente novamente."}
          onRetry={() => void refetch()}
        />
      ) : (carregando || atualizando) && (
        <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Conferindo pendências…
        </div>
      )}
      {stable.ready && abertas.length > 0
        ? lista
        : podeConfirmarVazio ? vazio : null}
    </div>
  );

  return (
    <>
      <div className="flex min-h-11 items-center gap-1">
        <button
          type="button"
          onClick={() => (falhou ? void refetch() : setAberto(true))}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-muted/40"
          aria-label={falhou ? "Falha ao conferir pendências. Tentar novamente" : `Abrir pendências de documentos: ${resumo}`}
        >
          {carregando || atualizando ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                falhou || atrasadas > 0 ? "bg-destructive" : abertas.length > 0 ? "bg-warning" : "bg-primary",
              )}
              aria-hidden="true"
            />
          )}
          <span className={cn("min-w-0 break-words text-sm font-medium leading-tight", falhou || atrasadas > 0 ? "text-destructive" : "text-foreground")}>
            {falhou ? "Falha · Tentar novamente" : resumo}
          </span>
        </button>
        {onHistorico && (
          <Button type="button" variant="ghost" size="icon" aria-label="Ver histórico de importações" title="Histórico de importações" className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground" onClick={onHistorico}>
            <History className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {onImportar && (
          <Button type="button" className="h-11 shrink-0 gap-1.5 rounded-xl px-3" onClick={onImportar}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Importar
          </Button>
        )}
      </div>

      {isMobile ? (
        <Drawer open={aberto} onOpenChange={setAberto}>
          <DrawerContent className="max-h-[88dvh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>Pendências de Documentos</DrawerTitle>
              <DrawerDescription>
                {descricao}
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {conteudo}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Pendências de Documentos</DialogTitle>
              <DialogDescription>
                {descricao}
              </DialogDescription>
            </DialogHeader>
            {conteudo}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * Gestão de Documentos — tela única do módulo.
 *
 * Une a importação (PDF multipáginas, foto de atestado, comprovantes) e a
 * listagem completa dos documentos da equipe (antes "Histórico") em uma só
 * experiência. No topo, dois cards lado a lado: Pendências (abre gaveta na
 * própria tela) e Importar Documento (abre uma janela de envio). No celular a
 * lista aparece de imediato, sem blocos empilhados.
 *
 * Quando chega de uma pendência ("Resolver"), a natureza, a competência e a
 * unidade vêm na URL e aparecem num aviso, além de pré-preencherem a importação.
 */
export default function DpDocumentosGestao() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const unidades = useDpUnidades();

  const tipo = params.get("tipo");
  const competencia = params.get("competencia");
  const unidadeId = params.get("unidade");
  const lote = params.get("lote");

  // Pré-preenchimento capturado uma única vez: sobrevive à limpeza do aviso.
  const [inicial] = useState(() => ({
    tipo: params.get("tipo") ?? undefined,
    competencia: params.get("competencia") ?? undefined,
    lote: params.get("lote") ?? undefined,
  }));

  /**
   * A importação abre em janela pelo card em qualquer aparelho.
   * Abre automaticamente quando veio de uma
   * pendência (atalho pré-preenchido).
   */
  const [importarAberto, setImportarAberto] = useState(
    () => !!(inicial.tipo || inicial.lote),
  );
  /** Aba inicial da janela de importação: envio novo ou histórico de lotes. */
  const [abaInicial, setAbaInicial] = useState<"enviar" | "historico">("enviar");

  /**
   * O aviso vive na URL (veio do atalho "Resolver"). Fechá-lo precisa apagar os
   * parâmetros, senão ele reaparece ao recarregar ou voltar para a tela.
   */
  const limparContexto = () => {
    const next = new URLSearchParams(params);
    ["tipo", "competencia", "unidade", "lote"].forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };

  const unidadeNome =
    (unidades.data ?? []).find((u) => u.id === unidadeId)?.nome ?? null;

  const partes = [
    tipo ? docTipoLabel(tipo) : null,
    competenciaLabel(competencia),
    unidadeNome,
  ].filter(Boolean) as string[];

  const mostrarAviso = partes.length > 0 || !!lote;

  return (
    <DpPage>
      <Helmet>
        <title>Gerir Documentos — Pessoas 360°</title>
        <meta
          name="description"
          content="Importe e acompanhe os documentos da equipe em um só lugar: contracheques, pontos, atestados, férias e comprovantes, com distribuição automática por colaborador."
        />
      </Helmet>

      <DpPageHeader
        icon={FileText}
        title="Gerir Documentos"
        description="Importe documentos e acompanhe assinaturas e comprovantes da equipe em um só lugar."
      />

      {mostrarAviso && (
        <Alert className="relative pr-10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {partes.length > 0
              ? `Importando: ${partes.join(" · ")}`
              : "Lote aberto para revisão."}
          </AlertDescription>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={limparContexto}
            className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      {/* Card único: pendências (gaveta na própria tela), histórico de lotes e importação. */}
      <AcoesDocumentosCard
        onImportar={() => { setAbaInicial("enviar"); setImportarAberto(true); }}
        onHistorico={() => { setAbaInicial("historico"); setImportarAberto(true); }}
      />

      <ImportarDocumentoDialog
        open={importarAberto}
        onOpenChange={setImportarAberto}
        abaInicial={abaInicial}
        tipoInicial={inicial.tipo}
        referenciaInicial={inicial.competencia ? `${inicial.competencia}-01` : undefined}
        loteAbertoId={inicial.lote}
        onLoteConcluido={() => {
          setImportarAberto(false);
          limparContexto();
          void qc.invalidateQueries({ queryKey: ["dp_historico_unified"] });
          void qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
          void qc.invalidateQueries({ queryKey: ["dp_pendencias_apuracao"] });
        }}
      />

      {/* Listagem completa da equipe (antiga tela "Histórico"), embutida. */}
      <DpHistoricoCompleto embutido />
    </DpPage>
  );
}
