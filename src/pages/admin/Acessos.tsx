import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLastAccess } from "@/components/admin/AdminLastAccess";

export default function AdminAcessos() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Últimos Acessos"
        description="Data e hora do último acesso de cada usuário, com contato e empresas vinculadas"
      />
      <AdminLastAccess />
    </div>
  );
}
