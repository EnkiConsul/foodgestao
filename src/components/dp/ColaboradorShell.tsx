import { Outlet, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";
import { DpShell } from "@/components/dp/DpShell";

export function ColaboradorShell() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: superLoading } = useSuperAdmin();

  const ownerOrAdmin = useQuery({
    queryKey: ["is_admin_or_owner", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [ownerRes, memberRes] = await Promise.all([
        supabase.from("companies").select("id").eq("user_id", user!.id).limit(1),
        supabase.from("company_members").select("role").eq("user_id", user!.id).in("role", ["owner", "admin"]).limit(1),
      ]);
      return !!(ownerRes.data?.length || memberRes.data?.length);
    },
  });

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
  if (superLoading || ownerOrAdmin.isLoading || check.isLoading) {
    return <div className="p-8 text-muted-foreground">Carregando…</div>;
  }
  // super_admin / owner / admin nunca entram no portal do colaborador
  if (isSuperAdmin || ownerOrAdmin.data) return <Navigate to="/hub" replace />;
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
    <>
      <CarenciaPortalBanner />
      <DpShell variant="portal" />
    </>
  );
}


