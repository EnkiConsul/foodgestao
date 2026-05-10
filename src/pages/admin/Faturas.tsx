import { AdminInvoices } from "@/components/admin/AdminInvoices";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminFaturasPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Faturas" description="Faturas emitidas" />
      <AdminInvoices />
    </div>
  );
}
