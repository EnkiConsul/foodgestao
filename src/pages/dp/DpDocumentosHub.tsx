import { Helmet } from "react-helmet-async";
import { FileText } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpGroupCards } from "@/components/dp/DpGroupCards";

export default function DpDocumentosHub() {
  return (
    <DpPage>
      <Helmet><title>Documentos — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={FileText}
        title="Documentos"
        description="Importe documentos, consulte o histórico e os registros disciplinares."
      />
      <DpGroupCards groupId="documentos" />
    </DpPage>
  );
}
