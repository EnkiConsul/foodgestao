import { Outlet, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";
import { DpShell } from "@/components/dp/DpShell";
import { CarenciaPortalBanner } from "@/components/dp/CarenciaPortalBanner";
import { DocumentoAssinaturaGate } from "@/components/dp/portal/DocumentoAssinaturaGate";


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
    queryKey: ["sou_dp_colaborador", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Identidade derivada da sessão no servidor.
      const { data, error } = await supabase.rpc("sou_dp_colaborador");
      if (error) throw error;
      return !!data;
    },
  });

  if (!user) return <Navigate to="/auth" replace />;
  if (superLoading || ownerOrAdmin.isLoading || check.isLoading) {
    return <div className="p-8 text-muted-foreground">Carregando…</div>;
  }
  // Quem é super_admin / owner / admin e NÃO tem ficha de colaborador não tem
  // o que ver no portal. Já o sócio administrador (com ficha ativa) pode usar
  // as duas áreas — o destino padrão dele segue sendo a área administrativa.
  if ((isSuperAdmin || ownerOrAdmin.data) && !check.data) return <Navigate to="/hub" replace />;
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
      <DocumentoAssinaturaGate />
      <DpShell variant="portal" />
    </>
  );
}


