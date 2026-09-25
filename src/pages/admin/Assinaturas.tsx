import { AdminSubscriptions } from "@/components/admin/AdminSubscriptions";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminAssinaturas() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Assinaturas" description="Assinaturas por empresa contratante, com dono titular e contratações adicionais" />
      <AdminSubscriptions />
    </div>
  );
}
