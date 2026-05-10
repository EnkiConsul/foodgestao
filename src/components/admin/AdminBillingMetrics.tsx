import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/billing";
import { TrendingUp, Users, AlertCircle, CheckCircle2 } from "lucide-react";

export function AdminBillingMetrics() {
  const { data } = useQuery({
    queryKey: ["billing-metrics"],
    queryFn: async () => {
      const [{ data: subs }, { data: invoices }] = await Promise.all([
        supabase.from("subscriptions").select("status, plan:plans(price_cents, billing_period)"),
        supabase.from("invoices").select("status, amount_cents, paid_at").gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
      ]);

      const active = (subs || []).filter((s: any) => ["active", "trialing", "past_due"].includes(s.status));
      const mrrCents = active.reduce((acc: number, s: any) => {
        const p = s.plan;
        if (!p) return acc;
        const monthly = p.billing_period === "yearly" ? p.price_cents / 12 : p.price_cents;
        return acc + monthly;
      }, 0);

      const paid30 = (invoices || []).filter((i: any) => i.status === "paid");
      const paid30Cents = paid30.reduce((a: number, i: any) => a + (i.amount_cents || 0), 0);
      const overdueCount = (invoices || []).filter((i: any) => i.status === "overdue").length;

      return {
        mrrCents: Math.round(mrrCents),
        arrCents: Math.round(mrrCents * 12),
        activeCount: active.length,
        trialingCount: active.filter((s: any) => s.status === "trialing").length,
        paid30Cents,
        overdueCount,
        canceledCount: (subs || []).filter((s: any) => s.status === "canceled").length,
      };
    },
  });

  const cards = [
    { label: "MRR", value: formatCents(data?.mrrCents ?? 0), icon: TrendingUp, color: "text-emerald-600" },
    { label: "ARR", value: formatCents(data?.arrCents ?? 0), icon: TrendingUp, color: "text-blue-600" },
    { label: "Assinaturas ativas", value: data?.activeCount ?? 0, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Em trial", value: data?.trialingCount ?? 0, icon: Users, color: "text-amber-600" },
    { label: "Faturado (30d)", value: formatCents(data?.paid30Cents ?? 0), icon: TrendingUp, color: "text-emerald-600" },
    { label: "Vencidas", value: data?.overdueCount ?? 0, icon: AlertCircle, color: "text-rose-600" },
    { label: "Canceladas", value: data?.canceledCount ?? 0, icon: AlertCircle, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
