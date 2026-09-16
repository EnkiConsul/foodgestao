import { AdminCompanies } from "@/components/admin/AdminCompanies";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminPerfisAcesso() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Empresas" description="Empresas cadastradas" />
      <AdminCompanies />
    </div>
  );
}
