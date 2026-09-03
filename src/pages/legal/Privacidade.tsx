import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLegalSection } from "@/hooks/useLegalContent";

export default function Privacidade() {
  const c = useLegalSection("legal_privacy");
  return (
    <LegalDocumentView
      title={c.title}
      lastUpdated={c.last_updated}
      body={c.body}
      canonicalPath="/privacidade"
      metaDescription="Política de Privacidade do Aveto 360, em conformidade com a LGPD."
    />
  );
}
