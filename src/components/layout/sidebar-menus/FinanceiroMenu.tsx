import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, Target, FileBarChart,
  Landmark, CreditCard, Users, FolderTree, BookOpen,
} from "lucide-react";
import { SidebarSection, SidebarNavItem, SidebarCollapsibleGroup, type MenuItem } from "./shared";

const items: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Lançamentos", url: "/lancamentos", icon: ArrowLeftRight, end: true },
  { title: "Fluxo de Caixa", url: "/fluxo-caixa", icon: TrendingUp, end: true },
  { title: "Orçamento", url: "/orcamento", icon: Target, end: true },
];

const cadastros: MenuItem[] = [
  { title: "Contas Bancárias", url: "/contas-bancarias", icon: Landmark },
  { title: "Cartões de Crédito", url: "/cartoes-credito", icon: CreditCard },
  { title: "Formas de Pagamento", url: "/formas-pagamento", icon: CreditCard },
  { title: "Clientes / Fornecedores", url: "/contatos", icon: Users },
  { title: "Categorias", url: "/categorias", icon: FolderTree },
  
  { title: "Contas Contábeis", url: "/contas-contabeis", icon: BookOpen },
];

export function FinanceiroMenu() {
  return (
    <>
      <SidebarSection label="Financeiro 360°">
        {items.map((i) => <SidebarNavItem key={i.url} item={i} />)}
        <SidebarNavItem
          item={{ title: "Relatórios Contábeis", url: "/relatorios/contabeis", icon: FileBarChart, end: true }}
        />
      </SidebarSection>

      <SidebarSection label="Cadastros">
        {cadastros.map((i) => <SidebarNavItem key={i.url} item={i} />)}
      </SidebarSection>
    </>
  );
}
