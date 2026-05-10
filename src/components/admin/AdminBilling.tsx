import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminBillingMetrics } from "./AdminBillingMetrics";
import { AdminInvoices } from "./AdminInvoices";
import { AdminCoupons } from "./AdminCoupons";

export function AdminBilling() {
  return (
    <div className="space-y-4">
      <AdminBillingMetrics />
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Faturas</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><AdminInvoices /></TabsContent>
        <TabsContent value="coupons"><AdminCoupons /></TabsContent>
      </Tabs>
    </div>
  );
}
