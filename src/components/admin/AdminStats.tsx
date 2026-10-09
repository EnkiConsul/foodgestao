import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, ArrowLeftRight, Landmark, UserPlus, IdCard, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCliente360Lista, useAdminUsuariosAuth } from "@/hooks/useCliente360";
import { brl, ehCliente, mrrPotencial } from "@/lib/admin/cliente360";

// Cliente = conta de cobrança de produção, não teste, não interna, com empresa ativa.
export function AdminStats() {
  const contas = useCliente360Lista();
  const users = useAdminUsuariosAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [tx, acc] = await Promise.all([
        supabase.from("transactions").select("id", { count: "exact", head: true }),
        supabase.from("accounts").select("id", { count: "exact", head: true }),
      ]);
      return { tx: tx.count ?? 0, acc: acc.count ?? 0 };
    },
  });

  const clientes = (contas.data ?? []).filter(ehCliente);
  const empresas = clientes.reduce((t, c) => t + c.empresas.length, 0);
  const mrr = clientes.reduce((t, c) => t + mrrPotencial(c), 0);
  const leads = (users.data ?? []).filter((u) => u.tipo === "sem_empresa").length;
  const portal = (users.data ?? []).filter((u) => u.tipo === "colaborador_portal" && u.is_active).length;

  const cards = [
    { title: "Clientes", value: clientes.length, icon: Users, loading: contas.isLoading },
    { title: "Empresas de clientes", value: empresas, icon: Building2, loading: contas.isLoading },
    { title: "MRR potencial", value: brl(mrr), icon: Wallet, loading: contas.isLoading },
    { title: "Lançamentos", value: stats?.tx, icon: ArrowLeftRight, loading: isLoading },
    { title: "Contas Financeiras", value: stats?.acc, icon: Landmark, loading: isLoading },
    { title: "Cadastros sem empresa (leads)", value: leads, icon: UserPlus, loading: users.isLoading },
    { title: "Colaboradores ativos no portal", value: portal, icon: IdCard, loading: users.isLoading },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {card.loading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{typeof card.value === "number" ? card.value.toLocaleString("pt-BR") : card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
