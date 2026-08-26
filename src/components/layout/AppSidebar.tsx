import { LogOut, MessageCircle, LayoutGrid } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import assinatura360 from "@/assets/360food-assinatura.png.asset.json";
import symbol360 from "@/assets/360food-symbol.png.asset.json";

import { useAuth } from "@/hooks/useAuth";
import { useActiveModule } from "@/hooks/useActiveModule";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

import { FinanceiroMenu } from "./sidebar-menus/FinanceiroMenu";
// DpMenu removido: o módulo DP possui shell próprio (DpShell/DpSidebar).
// Quando o módulo DP está ativo o AppSidebar não renderiza menu de módulo.
import { PortalMenu } from "./sidebar-menus/PortalMenu";
import { AccountMenu } from "./sidebar-menus/AccountMenu";
import { ComingSoonMenu } from "./sidebar-menus/ComingSoonMenu";
import { SidebarToggleButton } from "./SidebarToggleButton";


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const activeModule = useActiveModule();

  const renderModuleMenu = () => {
    switch (activeModule) {
      case "financeiro": return <FinanceiroMenu />;
      case "dp": return null;
      case "portal_colaborador": return <PortalMenu />;
      case "conta": return null;
      case "hub":
      case "admin":
      default: return null;
    }
  };

  const accountVariant = activeModule === "portal_colaborador" ? "portal" : "full";
  const showAccount = activeModule !== "admin";

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      <SidebarHeader className={cn("border-b border-sidebar-border mb-2 overflow-hidden", collapsed ? "px-1 py-2" : "p-3")}>
        <div className={cn("flex w-full", collapsed ? "flex-col items-center justify-center gap-1" : "flex-row items-center justify-between")}>
          <img
            src={collapsed ? symbol360.url : assinatura360.url}
            alt="360°FOOD"
            className={cn(
              "object-contain select-none",
              collapsed ? "h-6 w-auto max-w-full" : "h-12 w-auto max-w-full"
            )}
            draggable={false}
          />
          <SidebarToggleButton className={collapsed ? "h-6 w-6 p-1" : "h-7 w-7 p-0"} />
        </div>
      </SidebarHeader>


      <SidebarContent>
        {/* Hub link — presente em todos os módulos exceto no portal do colaborador (que não tem acesso ao hub) */}
        {activeModule !== "portal_colaborador" && activeModule !== "admin" && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/hub"
                      end
                      className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary hover:bg-sidebar-accent rounded-lg mx-2 transition-all duration-200 hover:translate-x-1 font-medium"
                      activeClassName="bg-sidebar-accent translate-x-1"
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0" />
                      <span>Hub de Módulos</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {renderModuleMenu()}

        {showAccount && <AccountMenu variant={accountVariant} />}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-1">
        <a
          href="https://wa.me/5562992365959"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Suporte</span>
        </a>
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
