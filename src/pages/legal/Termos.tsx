import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLegalSection } from "@/hooks/useLegalContent";

export default function Termos() {
  const c = useLegalSection("legal_terms");
  return (
    <LegalDocumentView
      title={c.title}
      lastUpdated={c.last_updated}
      body={c.body}
      canonicalPath="/termos"
      metaDescription="Termos de Uso da plataforma Aveto 360."
    />
  );
}
