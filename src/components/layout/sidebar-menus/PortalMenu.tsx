import { Home, User, FileText, ClipboardList, Repeat } from "lucide-react";
import { SidebarSection, SidebarNavItem, type MenuItem } from "./shared";

const items: MenuItem[] = [
  { title: "Início", url: "/dp/meu", icon: Home, end: true },
  { title: "Meus dados", url: "/dp/meu/perfil", icon: User },
  { title: "Documentos", url: "/dp/meu/documentos", icon: FileText },
  { title: "Solicitações", url: "/dp/meu/solicitacoes", icon: ClipboardList },
  { title: "Trocas", url: "/dp/meu/trocas", icon: Repeat },
];

export function PortalMenu() {
  return (
    <SidebarSection label="Portal">
      {items.map((i) => <SidebarNavItem key={i.url} item={i} />)}
    </SidebarSection>
  );
}
