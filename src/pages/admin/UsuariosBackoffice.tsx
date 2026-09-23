import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBackofficeUsuarios } from "@/components/admin/AdminBackofficeUsuarios";

export default function AdminUsuariosBackoffice() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Usuários do Backoffice"
        description="Conceda ou revogue o acesso administrativo à plataforma"
      />
      <AdminBackofficeUsuarios />
    </div>
  );
}
