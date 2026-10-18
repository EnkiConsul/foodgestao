import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, FileText, Info, ListChecks, Upload, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";
import { docTipoLabel } from "@/lib/dp/documentoTipos";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpPendenciasDecisoes } from "@/hooks/useDpPendenciasDecisoes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { filtrarAbertas, urgenciaDe } from "@/lib/dp/pendencias";
import { eixoDe } from "@/lib/dp/acoes-eixos";
import { useStablePendencias } from "@/components/dp/home/PendenciasCard";
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

/**
 * Resumo compacto das ações de documentos (mesmo motor das Ações do Dia da
 * tela inicial, filtrado para o assunto "Documentos e contabilidade").
 * Um clique abre a tela completa já na aba Documentos.
 */
function AcoesDocumentosChip() {
  const { selectedCompanyId } = useCompanyContext();
  const { data, isLoading, isFetching, dataUpdatedAt, lastCalculatedAt } = useDpPendencias();
  const stable = useStablePendencias({ companyId: selectedCompanyId, data, dataUpdatedAt, lastCalculatedAt, isLoading, isFetching });
  const { prefs } = useDpUserPrefs();
  const { ignoradas, adiadas } = useDpPendenciasDecisoes();

  const abertas = useMemo(
    () =>
      filtrarAbertas(
        stable.data.filter((p) => !ignoradas.has(p.id) && eixoDe(p) === "documentos"),
        { ...prefs.pendencias_adiadas, ...adiadas },
      ),
    [stable.data, prefs.pendencias_adiadas, ignoradas, adiadas],
  );
  const atrasadas = abertas.filter((p) => urgenciaDe(p) === "atrasada").length;
  const hoje = abertas.filter((p) => urgenciaDe(p) === "hoje").length;
  const carregando = !stable.ready;

  const resumo = carregando
    ? "Carregando…"
    : abertas.length === 0
      ? "Tudo em dia"
      : [atrasadas > 0 && `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`, hoje > 0 && `${hoje} para hoje`]
          .filter(Boolean)
          .join(" · ") || "Nenhuma urgente";

  return (
    <Link
      to="/dp/cadastros/pendencias?eixo=documentos"
      className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--dp-border))] bg-card px-4 py-2.5 transition-colors hover:bg-muted/40"
      aria-label="Abrir ações de documentos"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ListChecks className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Ações de Documentos</p>
        <p className={atrasadas > 0 ? "truncate text-xs text-destructive" : "truncate text-xs text-muted-foreground"}>{resumo}</p>
      </div>
      {!carregando && abertas.length > 0 && (
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary-foreground">{abertas.length}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/**
 * Gestão de Documentos — tela única do módulo.
 *
 * Une a importação (PDF multipáginas, foto de atestado, comprovantes) e a
 * listagem completa dos documentos da equipe (antes "Histórico") em uma só
 * experiência. No celular a lista aparece de imediato: a importação abre por
 * um botão flutuante na zona do polegar e as pendências de documentos viram
 * um resumo de uma linha que leva às Ações do Dia.
 *
 * Quando chega de uma pendência ("Resolver"), a natureza, a competência e a
 * unidade vêm na URL e aparecem num aviso, além de pré-preencherem a importação.
 */
export default function DpDocumentosGestao() {
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
   * No celular a importação abre pelo botão flutuante (não empurra a lista);
   * no computador fica sempre visível no topo. Abre automaticamente quando
   * veio de uma pendência (atalho pré-preenchido).
   */
  const [importarAberto, setImportarAberto] = useState(
    () => !!(inicial.tipo || inicial.lote),
  );

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
        <title>Gestão de Documentos — Pessoas 360°</title>
        <meta
          name="description"
          content="Importe e acompanhe os documentos da equipe em um só lugar: contracheques, pontos, atestados, férias e comprovantes, com distribuição automática por colaborador."
        />
      </Helmet>

      <DpPageHeader
        icon={FileText}
        title="Gestão de Documentos"
        description="Importe documentos e acompanhe assinaturas e comprovantes da equipe em um só lugar."
      />

      {mostrarAviso && (
        <Alert className="relative pr-10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {partes.length > 0
              ? `Importando: ${partes.join(" · ")}`
              : "Lote aberto para revisão abaixo."}
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

      {/* Pendências de documentos: resumo de uma linha, mesmo motor das Ações do Dia. */}
      <AcoesDocumentosChip />

      {/* Importação: sempre visível no computador; no celular abre pelo botão flutuante. */}
      <div className={importarAberto ? "" : "hidden md:block"}>
        {importarAberto && (
          <div className="mb-1 flex justify-end md:hidden">
            <button
              type="button"
              className="min-h-11 px-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setImportarAberto(false)}
            >
              Recolher importação
            </button>
          </div>
        )}
        <BulkImportPanel
          title="Importar Documento"
          tipoInicial={inicial.tipo}
          referenciaInicial={inicial.competencia ? `${inicial.competencia}-01` : undefined}
          loteAbertoId={inicial.lote}
          onLoteConcluido={limparContexto}
        />
      </div>

      {/* Listagem completa da equipe (antiga tela "Histórico"), embutida. */}
      <DpHistoricoCompleto embutido />

      {/* Botão flutuante de importação na zona do polegar (só no celular). */}
      {!importarAberto && (
        <button
          type="button"
          onClick={() => setImportarAberto(true)}
          aria-label="Importar Documento"
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
    </DpPage>
  );
}
