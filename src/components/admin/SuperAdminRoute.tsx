import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { MfaEnrollRequired } from "@/components/auth/MfaEnrollRequired";
import { MfaIntroDialog } from "@/components/auth/MfaIntroDialog";

type MfaState = "checking" | "ok" | "challenge" | "enroll";

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const [mfa, setMfa] = useState<MfaState>("checking");
  const [introAberto, setIntroAberto] = useState(true);

  const negado = !authLoading && !roleLoading && !!user && !isSuperAdmin;

  useEffect(() => {
    if (!negado) return;
    toast.info("Acesso restrito ao Backoffice da plataforma", {
      description: "Esta área é de uso exclusivo da administração do sistema.",
    });
  }, [negado]);

  // Super admin só entra com verificação em duas etapas concluída (aal2).
  // O banco também exige aal2 — esta etapa apenas conduz a pessoa.
  const verificar = useCallback(async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") return setMfa("ok");
    if (aal?.nextLevel === "aal2") return setMfa("challenge");
    setMfa("enroll");
  }, []);

  useEffect(() => {
    if (user && isSuperAdmin) void verificar();
  }, [user, isSuperAdmin, verificar]);

  const onDone = useCallback(() => {
    setMfa("checking");
    void supabase.auth.refreshSession().finally(() => void verificar());
  }, [verificar]);
  const onCancel = useCallback(() => setMfa("checking"), []);

  if (authLoading || roleLoading || (isSuperAdmin && mfa === "checking")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  if (mfa !== "ok") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 space-y-4">
          <h1 className="text-lg font-semibold">
            {mfa === "enroll" ? "Ative a verificação em duas etapas" : "Confirme sua identidade"}
          </h1>
          <p className="text-sm text-muted-foreground">
            O Backoffice exige verificação em duas etapas para administradores da plataforma.
          </p>
          {mfa === "enroll" ? (
            <>
              <MfaEnrollRequired onSuccess={onDone} />
              <MfaIntroDialog open={introAberto} onProceed={() => setIntroAberto(false)} />
            </>
          ) : (
            <MfaChallenge onSuccess={onDone} onCancel={onCancel} />
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
