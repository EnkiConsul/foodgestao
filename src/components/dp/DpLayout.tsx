import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Users, ClipboardList, FolderOpen, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyContext } from "@/hooks/useCompanyContext";

const items = [
  { title: "Início", url: "/dp", icon: Home, end: true },
  { title: "Colaboradores", url: "/dp/colaboradores", icon: Users },
  { title: "Solicitações", url: "/dp/solicitacoes", icon: ClipboardList },
  { title: "Documentos", url: "/dp/documentos", icon: FolderOpen },
];

export function DpLayout() {
  const { contextType } = useCompanyContext();
  const { pathname } = useLocation();

  if (contextType !== "pj") {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-muted-foreground">
        DP 360° está disponível apenas em contexto Empresa (PJ).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {items.map((it) => {
          const active = it.end ? pathname === it.url : pathname.startsWith(it.url);
          return (
            <NavLink
              key={it.url}
              to={it.url}
              end={it.end}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <it.icon className="h-4 w-4" />
              {it.title}
            </NavLink>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
