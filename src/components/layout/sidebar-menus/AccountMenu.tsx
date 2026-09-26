import { Building2, UserCog, Settings, Shield, CreditCard } from "lucide-react";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { SidebarSection, SidebarNavItem, type MenuItem } from "./shared";

const full: MenuItem[] = [
  { title: "Minhas Empresas", url: "/empresas", icon: Building2 },
  { title: "Usuários", url: "/gestao-usuarios", icon: UserCog },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
  { title: "Plano e Assinatura", url: "/assinatura", icon: CreditCard },
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
