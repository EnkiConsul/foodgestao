import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NavLink } from "@/components/NavLink";

export type MenuItem = { title: string; url: string; icon: LucideIcon; end?: boolean };

export function SidebarNavItem({ item }: { item: MenuItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.end}
          className="flex items-center gap-3 px-5 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg mx-2 transition-all duration-200 hover:translate-x-1"
          activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium translate-x-1"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SidebarSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <SidebarGroup>
      {label && (
        <SidebarGroupLabel className="text-sidebar-foreground/80 text-xs uppercase tracking-wider px-5">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SidebarCollapsibleGroup({
  label,
  icon: Icon,
  items,
  matchPrefix,
}: {
  label: string;
  icon: LucideIcon;
  items: { title: string; url: string; end?: boolean }[];
  matchPrefix: string;
}) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(matchPrefix);
  const [open, setOpen] = useState(active);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className={`flex items-center gap-3 px-5 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg mx-2 transition-all duration-200 hover:translate-x-1 ${
              active ? "bg-sidebar-accent text-sidebar-foreground font-medium translate-x-1" : ""
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            <ChevronRight
              className={`ml-auto h-4 w-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((sub) => (
              <SidebarMenuSubItem key={sub.url}>
                <SidebarMenuSubButton asChild>
                  <NavLink
                    to={sub.url}
                    end={sub.end}
                    className="text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                  >
                    <span>{sub.title}</span>
                  </NavLink>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
