import { AdminStats } from "@/components/admin/AdminStats";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminEstatisticas() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Estatísticas" description="Visão geral da plataforma" />
      <AdminStats />
    </div>
  );
}
