import { Helmet } from "react-helmet-async";
import { Building2, Briefcase, HandshakeIcon } from "lucide-react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

const items = [
  { title: "Unidades", desc: "Filiais, lojas e centros de custo", url: "/dp/cadastros/unidades", icon: Building2 },
  { title: "Cargos", desc: "Cargos, CBO e salário base", url: "/dp/cadastros/cargos", icon: Briefcase },
  { title: "Sindicatos", desc: "Sindicatos e datas-base", url: "/dp/cadastros/sindicatos", icon: HandshakeIcon },
];

export default function DpCadastrosHub() {
  return (
    <DpPage>
      <Helmet><title>Cadastros — DP 360°</title></Helmet>
      <DpPageHeader icon={Building2} title="Cadastros" description="Estrutura organizacional do DP." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <NavigationCard key={it.url} title={it.title} description={it.desc} to={it.url} icon={it.icon} />
        ))}
      </div>
    </DpPage>
  );
}
