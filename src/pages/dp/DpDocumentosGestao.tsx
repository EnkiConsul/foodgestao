import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { FileText, Info, Upload, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";
import { DocConsistenciaPanel } from "@/components/dp/documentos/DocConsistenciaPanel";
import { docTipoLabel } from "@/lib/dp/documentoTipos";
import { useDpUnidades } from "@/hooks/useDpCadastros";
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
 * Gestão de Documentos — tela única do módulo.
 *
 * Une a importação (PDF multipáginas, foto de atestado, comprovantes) e a
 * listagem completa dos documentos da equipe (antes "Histórico") em uma só
 * experiência: o gestor importa no topo e confere o resultado logo abaixo,
 * sem trocar de tela.
 *
 * Quando chega de uma pendência ("Resolver"), a natureza, a competência e a
 * unidade vêm na URL e aparecem num aviso, além de pré-preencherem a importação.
 */
export default function DpDocumentosGestao() {
  const [params, setParams] = useSearchParams();
  const [foco, setFoco] = useState<{ tipo: string; competencia: string; nonce: number } | null>(null);
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
   * No celular a área de importação fica recolhida atrás de um botão para não
   * empurrar a lista de documentos para baixo; no computador fica sempre aberta.
   * Abre automaticamente quando veio de uma pendência (atalho pré-preenchido).
   */
  const [importarAberto, setImportarAberto] = useState(
    () => !!(inicial.tipo || inicial.lote),
  );
  useEffect(() => {
    if (foco) setImportarAberto(true);
  }, [foco]);

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

      {/* Importação é o primeiro bloco: quem entra para enviar encontra de imediato. */}
      {!importarAberto && (
        <Button className="w-full md:hidden" onClick={() => setImportarAberto(true)}>
          <Upload className="mr-2 h-4 w-4" /> Importar Documento
        </Button>
      )}
      <div className={importarAberto ? "" : "hidden md:block"}>
        {importarAberto && (
          <div className="mb-1 flex justify-end md:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setImportarAberto(false)}
            >
              Recolher importação
            </Button>
          </div>
        )}
        <BulkImportPanel
          title="Importar Documento"
          tipoInicial={inicial.tipo}
          referenciaInicial={inicial.competencia ? `${inicial.competencia}-01` : undefined}
          loteAbertoId={inicial.lote}
          foco={foco}
          onLoteConcluido={limparContexto}
        />
      </div>

      <DocConsistenciaPanel
        onImportar={(t, comp) =>
          setFoco((f) => ({ tipo: t, competencia: comp, nonce: (f?.nonce ?? 0) + 1 }))
        }
      />

      {/* Listagem completa da equipe (antiga tela "Histórico"), embutida. */}
      <DpHistoricoCompleto embutido />
    </DpPage>
  );
}
