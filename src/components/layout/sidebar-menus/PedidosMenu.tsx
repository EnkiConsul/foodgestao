import {
  BarChart3,
  ChefHat,
  ClipboardList,
  PackageCheck,
  Plug,
  Settings2,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { SidebarNavItem, SidebarSection, type MenuItem } from "./shared";

const operacao: MenuItem[] = [
  { title: "Início", url: "/pedidos", icon: ShoppingCart, end: true },
  { title: "Central de Pedidos", url: "/pedidos/central", icon: ClipboardList, end: true },
  { title: "Cozinha", url: "/pedidos/cozinha", icon: ChefHat, end: true },
  { title: "Expedição", url: "/pedidos/expedicao", icon: PackageCheck, end: true },
];

const gestao: MenuItem[] = [
  { title: "Cardápio", url: "/pedidos/cardapio", icon: UtensilsCrossed, end: true },
  { title: "Relatórios", url: "/pedidos/relatorios", icon: BarChart3, end: true },
  { title: "Integrações", url: "/pedidos/integracoes", icon: Plug, end: true },
  { title: "Configurar unidade", url: "/pedidos/onboarding", icon: Settings2, end: true },
];

export function PedidosMenu() {
  return (
    <>
      <SidebarSection label="Pedidos 360°">
        {operacao.map((item) => <SidebarNavItem key={item.url} item={item} />)}
      </SidebarSection>

      <SidebarSection label="Gestão">
        {gestao.map((item) => <SidebarNavItem key={item.url} item={item} />)}
      </SidebarSection>
    </>
  );
}