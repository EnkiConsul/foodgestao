import { Outlet, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";

export function ColaboradorShell() {
  const { user } = useAuth();

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
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
