import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, ArrowLeftRight, Landmark } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [profilesRes, companiesRes, transactionsRes, accountsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("transactions").select("id", { count: "exact", head: true }),
        supabase.from("accounts").select("id", { count: "exact", head: true }),
      ]);
      return {
        totalUsers: profilesRes.count ?? 0,
        totalCompanies: companiesRes.count ?? 0,
        totalTransactions: transactionsRes.count ?? 0,
        totalAccounts: accountsRes.count ?? 0,
      };
    },
  });

  const cards = [
    { title: "Usuários", value: stats?.totalUsers, icon: Users, color: "text-blue-500" },
    { title: "Perfis de Acesso", value: stats?.totalCompanies, icon: Building2, color: "text-emerald-500" },
    { title: "Lançamentos", value: stats?.totalTransactions, icon: ArrowLeftRight, color: "text-amber-500" },
    { title: "Contas Financeiras", value: stats?.totalAccounts, icon: Landmark, color: "text-purple-500" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={`h-5 w-5 ${card.color}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{card.value?.toLocaleString("pt-BR")}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
