import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TelasDesenvolvimentoPanel } from "@/components/dp/TelasDesenvolvimentoPanel";

export default function TelasDesenvolvimento() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Telas em Desenvolvimento"
        description="Marque as telas inacabadas e use o interruptor único para ocultá-las de todos os usuários."
      />
      <TelasDesenvolvimentoPanel />
    </div>
  );
}
