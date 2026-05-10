import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminClientes() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Clientes" description="Usuários da plataforma" />
      <AdminUsers />
    </div>
  );
}
