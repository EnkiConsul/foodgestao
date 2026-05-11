import { AdminAsaasWebhooks } from "@/components/admin/AdminAsaasWebhooks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminWebhooksAsaas() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Webhooks Asaas"
        description="Logs e tentativas recebidas do gateway de pagamento, com deduplicação automática por event_id."
      />
      <AdminAsaasWebhooks />
    </div>
  );
}
