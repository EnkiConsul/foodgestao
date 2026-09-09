import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { FileUp, ListChecks, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";
import { DocConsistenciaPanel } from "@/components/dp/documentos/DocConsistenciaPanel";
import { docTipoLabel } from "@/lib/dp/documentoTipos";
import { useDpUnidades } from "@/hooks/useDpCadastros";

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
 * Central única de importação de documentos do Pessoas 360°.
 * Um PDF de qualquer natureza (contracheque, 13º, férias, ponto, adiantamento…)
 * é dividido por página, a natureza é detectada automaticamente e cada página
 * é distribuída ao colaborador correspondente.
 *
 * Quando chega de uma pendência ("Resolver"), a natureza, a competência e a
 * unidade vêm na URL e aparecem num aviso, além de pré-preencherem o formulário.
 */
export default function DpDocumentosImportar() {
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

  const mostrarAviso = avisoAberto && (partes.length > 0 || !!lote);

  return (
    <DpPage>
      <Helmet>
        <title>Importar — Pessoas 360°</title>
        <meta
          name="description"
          content="Importe contracheques, 13º, férias, folhas de ponto e adiantamentos em um único lugar, com distribuição automática por colaborador."
        />
      </Helmet>

      <DpPageHeader
        icon={FileUp}
        title="Importar"
        description="Envie o PDF do escritório contábil. O sistema identifica a natureza, a competência e o colaborador de cada página."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/dp/documentos/historico">
              <ListChecks className="h-4 w-4 mr-1" /> Histórico
            </Link>
          </Button>
        }
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
            onClick={() => setAvisoAberto(false)}
            className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      <DocConsistenciaPanel
        onImportar={(t, comp) =>
          setFoco((f) => ({ tipo: t, competencia: comp, nonce: (f?.nonce ?? 0) + 1 }))
        }
      />

      <BulkImportPanel
        title="Importação em Massa (PDF com Várias Páginas)"
        tipoInicial={tipo ?? undefined}
        referenciaInicial={competencia ? `${competencia}-01` : undefined}
        loteAbertoId={lote ?? undefined}
        foco={foco}
      />
    </DpPage>
  );
}
