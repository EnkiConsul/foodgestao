import { Home, User, FileText, ClipboardList, Repeat, CalendarDays, CalendarClock, History, Megaphone, BellRing, Fingerprint } from "lucide-react";
import { SidebarSection, SidebarNavItem, type MenuItem } from "./shared";

const items: MenuItem[] = [
  { title: "Início", url: "/dp/meu", icon: Home, end: true },
  { title: "Mural", url: "/dp/meu/mural", icon: Megaphone },
  { title: "Meus dados", url: "/dp/meu/perfil", icon: User },
  { title: "Calendário", url: "/dp/meu/calendario", icon: CalendarDays },
  { title: "Minha Escala", url: "/dp/meu/escala", icon: CalendarClock },
  { title: "Convocações", url: "/dp/meu/convocacoes", icon: BellRing },
  { title: "Meu Ponto", url: "/dp/meu/ponto", icon: Fingerprint, badge: "Em breve" },
  { title: "Meus documentos", url: "/dp/meu/documentos", icon: FileText },
  { title: "Solicitações", url: "/dp/meu/solicitacoes", icon: ClipboardList },
  { title: "Trocas", url: "/dp/meu/trocas", icon: Repeat },
  { title: "Meu histórico", url: "/dp/meu/historico", icon: History },
];

export function PortalMenu() {
  return (
    <SidebarSection label="Portal">
      {items.map((i) => <SidebarNavItem key={i.url} item={i} />)}
    </SidebarSection>
  );
}
