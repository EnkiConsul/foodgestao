import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, Target, FileBarChart,
  Landmark, CreditCard, Users, FolderTree, BookOpen,
} from "lucide-react";
import { SidebarSection, SidebarNavItem, type MenuItem } from "./shared";

const items: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Lançamentos", url: "/lancamentos", icon: ArrowLeftRight, end: true },
  { title: "Fluxo de Caixa", url: "/fluxo-caixa", icon: TrendingUp, end: true },
  { title: "Orçamento", url: "/orcamento", icon: Target, end: true },
];

const cadastros: MenuItem[] = [
  { title: "Contas Financeiras", url: "/contas-bancarias", icon: Landmark },
  { title: "Cartões de Crédito", url: "/cartoes-credito", icon: CreditCard },
  { title: "Formas de Pagamento", url: "/formas-pagamento", icon: CreditCard },
  { title: "Centros de Custo", url: "/centros-custo", icon: Target },
  { title: "Clientes / Fornecedores", url: "/contatos", icon: Users },
  { title: "Categorias", url: "/categorias", icon: FolderTree },
  
  { title: "Contas Contábeis", url: "/contas-contabeis", icon: BookOpen },
];

const relatorios: MenuItem[] = [
  { title: "Fluxo de Caixa", url: "/relatorios/fluxo-caixa", icon: FileBarChart, end: true },
  { title: "DRE Gerencial", url: "/relatorios/contabeis", icon: BookOpen, end: true },
];

export function FinanceiroMenu() {
  return (
    <>
      <SidebarSection label="Financeiro 360°">
        {items.map((i) => <SidebarNavItem key={i.url} item={i} />)}
      </SidebarSection>

      <SidebarSection label="Relatórios">
        {relatorios.map((i) => <SidebarNavItem key={i.url} item={i} />)}
      </SidebarSection>

      <SidebarSection label="Cadastros">
        {cadastros.map((i) => <SidebarNavItem key={i.url} item={i} />)}
      </SidebarSection>
    </>
  );
}

