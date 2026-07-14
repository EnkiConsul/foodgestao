import { Building2, UserCog, Sparkles, Receipt, Settings, Shield } from "lucide-react";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { SidebarSection, SidebarNavItem, type MenuItem } from "./shared";

const full: MenuItem[] = [
  { title: "Perfis de Acesso", url: "/empresas", icon: Building2 },
  { title: "Usuários", url: "/gestao-usuarios", icon: UserCog },
  { title: "Meu Plano", url: "/planos", icon: Sparkles },
  { title: "Minhas Faturas", url: "/faturas", icon: Receipt },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

const portal: MenuItem[] = [
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AccountMenu({ variant = "full" }: { variant?: "full" | "portal" }) {
  const { isSuperAdmin } = useSuperAdmin();
  const items = variant === "portal" ? portal : full;
  const withAdmin = variant === "full" && isSuperAdmin
    ? [...items, { title: "Backoffice", url: "/admin", icon: Shield } as MenuItem]
    : items;
  return (
    <SidebarSection label="Conta">
      {withAdmin.map((i) => <SidebarNavItem key={i.url} item={i} />)}
    </SidebarSection>
  );
}
