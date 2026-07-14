import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Building2, Briefcase, HandshakeIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const items = [
  { title: "Unidades", desc: "Filiais, lojas e centros de custo", url: "/dp/cadastros/unidades", icon: Building2 },
  { title: "Cargos", desc: "Cargos, CBO e salário base", url: "/dp/cadastros/cargos", icon: Briefcase },
  { title: "Sindicatos", desc: "Sindicatos e datas-base", url: "/dp/cadastros/sindicatos", icon: HandshakeIcon },
];

export default function DpCadastrosHub() {
  return (
    <div className="space-y-4">
      <Helmet><title>Cadastros — DP 360°</title></Helmet>
      <div>
        <h2 className="text-xl font-semibold">Cadastros</h2>
        <p className="text-sm text-muted-foreground">Estrutura organizacional do DP.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Link key={it.url} to={it.url}>
            <Card className="hover:border-primary transition-colors h-full">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <it.icon className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle className="text-base">{it.title}</CardTitle>
                  <CardDescription>{it.desc}</CardDescription>
                </div>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
