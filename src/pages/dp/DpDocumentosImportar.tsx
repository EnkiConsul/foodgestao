import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { FileUp, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";
import { DocConsistenciaPanel } from "@/components/dp/documentos/DocConsistenciaPanel";

/**
 * Central única de importação de documentos do Pessoas 360°.
 * Um PDF de qualquer natureza (contracheque, 13º, férias, ponto, adiantamento…)
 * é dividido por página, a natureza é detectada automaticamente e cada página
 * é distribuída ao colaborador correspondente.
 */
export default function DpDocumentosImportar() {
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

      <DocConsistenciaPanel />

      <BulkImportPanel title="Importação em Massa (PDF com Várias Páginas)" />
    </DpPage>
  );
}
