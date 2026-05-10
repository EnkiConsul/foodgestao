import { AdminCompanies } from "@/components/admin/AdminCompanies";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminPerfisAcesso() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Perfis de Acesso" description="Tenants/empresas cadastrados" />
      <AdminCompanies />
    </div>
  );
}
