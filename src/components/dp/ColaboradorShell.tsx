import { NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Home, FileText, ClipboardList, Repeat, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Início", url: "/dp/meu", icon: Home, end: true },
  { title: "Meus dados", url: "/dp/meu/perfil", icon: User },
  { title: "Documentos", url: "/dp/meu/documentos", icon: FileText },
  { title: "Solicitações", url: "/dp/meu/solicitacoes", icon: ClipboardList },
  { title: "Trocas", url: "/dp/meu/trocas", icon: Repeat },
];

export function ColaboradorShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const check = useQuery({
    queryKey: ["is_dp_colaborador", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_dp_colaborador", { _user_id: user!.id });
      if (error) throw error;
      return !!data;
    },
  });

  if (!user) return <Navigate to="/auth" replace />;
  if (check.isLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (!check.data) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <h1 className="text-xl font-semibold">Portal indisponível</h1>
        <p className="text-muted-foreground">Sua conta não está vinculada como colaborador.</p>
        <Button onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold"><span className="text-primary">360°</span>FOOD</span>
            <span className="text-sm text-muted-foreground ml-2">Portal do Colaborador</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
        <nav className="mx-auto max-w-5xl flex gap-1 px-4 overflow-x-auto">
          {items.map((it) => {
            const active = it.end ? pathname === it.url : pathname.startsWith(it.url);
            return (
              <NavLink
                key={it.url}
                to={it.url}
                end={it.end}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap",
                  active ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <it.icon className="h-4 w-4" />
                {it.title}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
