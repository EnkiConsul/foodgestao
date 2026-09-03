import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLegalSection } from "@/hooks/useLegalContent";

export default function EncarregadoDados() {
  const c = useLegalSection("legal_dpo");
  const body = c.body
    .split("{dpo_name}").join(c.dpo_name)
    .split("{dpo_email}").join(c.dpo_email)
    .split("{controller_name}").join(c.controller_name)
    .split("{controller_cnpj}").join(c.controller_cnpj)
    .split("{controller_address}").join(c.controller_address);
  return (
    <LegalDocumentView
      title={c.title}
      lastUpdated={c.last_updated}
      body={body}
      canonicalPath="/encarregado-dados"
      metaDescription="Canal de contato do Encarregado de Tratamento de Dados (DPO) do Aveto 360."
    />
  );
}
