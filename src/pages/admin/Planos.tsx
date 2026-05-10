import { AdminPlans } from "@/components/admin/AdminPlans";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminPlanos() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Planos" description="Gestão dos planos da plataforma" />
      <AdminPlans />
    </div>
  );
}
