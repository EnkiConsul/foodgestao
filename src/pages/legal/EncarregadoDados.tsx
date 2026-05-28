import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLegalSection } from "@/hooks/useLegalContent";

export default function EncarregadoDados() {
  const c = useLegalSection("legal_dpo");
  const body = c.body
    .replaceAll("{dpo_name}", c.dpo_name)
    .replaceAll("{dpo_email}", c.dpo_email)
    .replaceAll("{controller_name}", c.controller_name)
    .replaceAll("{controller_cnpj}", c.controller_cnpj)
    .replaceAll("{controller_address}", c.controller_address);
  return (
    <LegalDocumentView
      title={c.title}
      lastUpdated={c.last_updated}
      body={body}
      canonicalPath="/encarregado-dados"
      metaDescription="Canal de contato do Encarregado de Tratamento de Dados (DPO) do Gestor Plin."
    />
  );
}
