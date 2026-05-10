import { AdminCoupons } from "@/components/admin/AdminCoupons";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminCuponsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Cupons" description="Cupons de desconto" />
      <AdminCoupons />
    </div>
  );
}
