import { Home, Users, Megaphone, AlertOctagon, Wallet, Building2, FileSignature } from "lucide-react";
import { SidebarSection, SidebarNavItem, SidebarCollapsibleGroup } from "./shared";

export function DpMenu() {
  return (
    <SidebarSection label="DP 360°">
      <SidebarNavItem item={{ title: "Início", url: "/dp", icon: Home, end: true }} />

      <SidebarCollapsibleGroup
        label="Operação"
        icon={Users}
        matchPrefix="/dp/colaboradores"
        items={[
          { title: "Colaboradores", url: "/dp/colaboradores" },
          { title: "Folgas", url: "/dp/folgas" },
          { title: "Trocas", url: "/dp/trocas" },
          { title: "Solicitações", url: "/dp/solicitacoes" },
          { title: "Aprovações", url: "/dp/aprovacoes" },
        ]}
      />
      <SidebarCollapsibleGroup
        label="Comunicação"
        icon={Megaphone}
        matchPrefix="/dp/avisos"
        items={[
          { title: "Avisos", url: "/dp/avisos" },
          { title: "Mensagens", url: "/dp/mensagens" },
        ]}
      />
      <SidebarCollapsibleGroup
        label="Compliance"
        icon={AlertOctagon}
        matchPrefix="/dp/disciplinar"
        items={[
          { title: "Disciplinar", url: "/dp/disciplinar" },
          { title: "Bloqueios", url: "/dp/bloqueios" },
          { title: "Documentos", url: "/dp/documentos" },
        ]}
      />
      <SidebarCollapsibleGroup
        label="Folha"
        icon={Wallet}
        matchPrefix="/dp/folha"
        items={[
          { title: "Períodos", url: "/dp/folha", end: true },
          { title: "Aprovações Financeiro", url: "/dp/folha/aprovacoes" },
        ]}
      />
      <SidebarCollapsibleGroup
        label="Cadastros"
        icon={Building2}
        matchPrefix="/dp/cadastros"
        items={[
          { title: "Visão geral", url: "/dp/cadastros", end: true },
          { title: "Unidades", url: "/dp/cadastros/unidades" },
          { title: "Cargos", url: "/dp/cadastros/cargos" },
          { title: "Sindicatos", url: "/dp/cadastros/sindicatos" },
          { title: "Negociações", url: "/dp/sindicatos/negociacoes" },
        ]}
      />
    </SidebarSection>
  );
}
