import { AdminBilling } from "@/components/admin/AdminBilling";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminFaturamento() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Faturamento" description="Métricas de faturamento" />
      <AdminBilling />
    </div>
  );
}
