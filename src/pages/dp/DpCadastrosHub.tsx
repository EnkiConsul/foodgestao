import { Helmet } from "react-helmet-async";
import { Users, Users2, Briefcase, Building2, FileText } from "lucide-react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

const items = [
  { title: "Colaboradores", desc: "Gerencie perfis, cargos e status de colaboradores.", url: "/dp/colaboradores", icon: Users },
  { title: "Cargos", desc: "Gerencie os cargos da empresa.", url: "/dp/cadastros/cargos", icon: Briefcase },
  { title: "Unidades", desc: "Gerencie as unidades da loja.", url: "/dp/cadastros/unidades", icon: Building2 },
  { title: "Sindicatos", desc: "Gerencie sindicatos, ACTs e CCTs.", url: "/dp/cadastros/sindicatos", icon: FileText },
];

export default function DpCadastrosHub() {
  return (
    <DpPage>
      <Helmet><title>Cadastro — DP 360°</title></Helmet>
      <DpPageHeader icon={Users2} title="Cadastro" description="Gerencie colaboradores, cargos, unidades e sindicatos." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <NavigationCard key={it.url} title={it.title} description={it.desc} to={it.url} icon={it.icon} />
        ))}
      </div>
    </DpPage>
  );
}
