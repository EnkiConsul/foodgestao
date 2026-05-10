import { AdminAuditLogs } from "@/components/admin/AdminAuditLogs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminAuditoria() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Auditoria" description="Histórico de ações administrativas" />
      <AdminAuditLogs />
    </div>
  );
}
