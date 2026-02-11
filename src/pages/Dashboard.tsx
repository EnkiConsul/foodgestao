import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";

const kpis = [
  { label: "Saldo Total", value: "R$ 12.450,00", change: "+8.2%", icon: Wallet, positive: true },
  { label: "Receitas", value: "R$ 8.200,00", change: "+12.5%", icon: TrendingUp, positive: true },
  { label: "Despesas", value: "R$ 5.340,00", change: "-3.1%", icon: TrendingDown, positive: false },
  { label: "Meta Mensal", value: "72%", change: "de R$ 10.000", icon: Target, positive: true },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral das suas finanças</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.positive ? "text-success" : "text-destructive"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{kpi.value}</div>
              <p className={`text-xs mt-1 ${kpi.positive ? "text-success" : "text-destructive"}`}>
                {kpi.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Receitas vs Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Gráfico de barras será implementado aqui
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top 5 Categorias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Gráfico donut será implementado aqui
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
