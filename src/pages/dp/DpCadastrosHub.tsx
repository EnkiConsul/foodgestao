import { Helmet } from "react-helmet-async";
import { Users, Users2, Briefcase, Building2, FileText, Handshake, Settings, BellRing, Clock, Scale } from "lucide-react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

const items = [
  { title: "Colaboradores", desc: "Gerencie perfis, cargos e status de colaboradores.", url: "/dp/colaboradores", icon: Users },
  { title: "Cargos", desc: "Gerencie os cargos da empresa.", url: "/dp/cadastros/cargos", icon: Briefcase },
  { title: "Unidades", desc: "Gerencie as unidades da loja.", url: "/dp/cadastros/unidades", icon: Building2 },
  { title: "Sindicatos", desc: "Gerencie sindicatos patronais e laborais.", url: "/dp/cadastros/sindicatos", icon: FileText },
  { title: "Negociações sindicais", desc: "Acordos ACT/CCT, reajustes e cláusulas.", url: "/dp/documentos/act-cct", icon: Handshake },
  { title: "Turnos", desc: "Horários reutilizáveis da operação: almoço, jantar, abertura e fechamento.", url: "/dp/cadastros/turnos", icon: Clock },
  
  { title: "Adicionais e Salário-Família", desc: "Anuênio/triênio/quinquênio e a tabela anual do salário-família.", url: "/dp/cadastros/adicionais", icon: Scale },
  { title: "Regras De Folgas", desc: "DSR, folga dominical, sábados, feriados, menores e férias.", url: "/dp/folgas/configuracoes/regras", icon: Scale },
  { title: "Pendências", desc: "Prazos e lembretes do quadro de pendências.", url: "/dp/cadastros/pendencias", icon: BellRing },
  { title: "Configurações de Pessoas", desc: "Limites de folga, bloqueios e regras gerais.", url: "/dp/configuracoes", icon: Settings },
];


export default function DpCadastrosHub() {
  return (
    <DpPage>
      <Helmet><title>Cadastro — Pessoas 360°</title></Helmet>
      <DpPageHeader icon={Users2} title="Cadastro" description="Gerencie colaboradores, cargos, unidades, sindicatos e configurações do DP." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <NavigationCard key={it.url} title={it.title} description={it.desc} to={it.url} icon={it.icon} />
        ))}
      </div>
    </DpPage>
  );
}
