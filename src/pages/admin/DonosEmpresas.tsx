import { AdminCompanyOwners } from "@/components/admin/AdminCompanyOwners";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminDonosEmpresas() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Donos das Empresas"
        description="Titular responsável pela assinatura e demais donos de cada empresa"
      />
      <AdminCompanyOwners />
    </div>
  );
}
