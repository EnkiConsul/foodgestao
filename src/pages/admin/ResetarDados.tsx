import { AdminResetData } from "@/components/admin/AdminResetData";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminResetarDados() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Resetar Dados" description="Operações destrutivas — use com cautela" />
      <AdminResetData />
    </div>
  );
}
