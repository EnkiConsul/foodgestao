import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useAuth } from "@/hooks/useAuth";

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();

  const negado = !authLoading && !roleLoading && !!user && !isSuperAdmin;

  // Aviso explícito: sem permissão o usuário entende o motivo do desvio,
  // em vez de ser levado a outra tela sem explicação.
  useEffect(() => {
    if (!negado) return;
    toast.info("Acesso restrito ao Backoffice da plataforma", {
      description: "Esta área é de uso exclusivo da administração do sistema.",
    });
  }, [negado]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
