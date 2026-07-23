import { Helmet } from "react-helmet-async";
import { FileStack } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";

export default function DpDocImportBulk() {
  return (
    <DpPage>
      <Helmet><title>Importação em massa — DP 360°</title></Helmet>
      <DpPageHeader
        icon={FileStack}
        title="Importação em massa de documentos"
        description="Envie um PDF multi-página. Cada página é dividida, passa por OCR e é vinculada ao colaborador para aprovação."
      />
      <BulkImportPanel title="Novo lote" />
    </DpPage>
  );
}
