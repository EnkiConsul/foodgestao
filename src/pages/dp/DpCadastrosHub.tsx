import { Helmet } from "react-helmet-async";
import { Users, Users2, Briefcase, Building2, FileText, Handshake, Settings } from "lucide-react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

const items = [
  { title: "Colaboradores", desc: "Gerencie perfis, cargos e status de colaboradores.", url: "/dp/colaboradores", icon: Users },
  { title: "Cargos", desc: "Gerencie os cargos da empresa.", url: "/dp/cadastros/cargos", icon: Briefcase },
  { title: "Unidades", desc: "Gerencie as unidades da loja.", url: "/dp/cadastros/unidades", icon: Building2 },
  { title: "Sindicatos", desc: "Gerencie sindicatos patronais e laborais.", url: "/dp/cadastros/sindicatos", icon: FileText },
  { title: "Negociações sindicais", desc: "Acordos ACT/CCT, reajustes e cláusulas.", url: "/dp/documentos/sindicato-negociacoes", icon: Handshake },
  { title: "Configurações do DP", desc: "Limites de folga, bloqueios e regras gerais.", url: "/dp/configuracoes", icon: Settings },
];

export default function DpCadastrosHub() {
  return (
    <DpPage>
      <Helmet><title>Cadastro — DP 360°</title></Helmet>
      <DpPageHeader icon={Users2} title="Cadastro" description="Gerencie colaboradores, cargos, unidades, sindicatos e configurações do DP." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <NavigationCard key={it.url} title={it.title} description={it.desc} to={it.url} icon={it.icon} />
        ))}
      </div>
    </DpPage>
  );
}
