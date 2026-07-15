import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { resolveOnboardingStatus } from "@/lib/onboardingStatus";

/**
 * Guarda de rotas privadas.
 *
 * Regra crítica: se o `profiles.onboarding_completed === true` (ou o usuário
 * já possui vínculo com uma empresa ativa), NUNCA redirecionar para
 * `/onboarding`. Essa é a garantia coberta pelo teste
 * `onboardingGuards.test.tsx` — não remover sem atualizar o teste.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { setContext } = useCompanyContext();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [mfaChecking, setMfaChecking] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setOnboardingCompleted(null);
      setCheckingOnboarding(false);
      setMfaChecking(false);
      setMfaRequired(false);
      return;
    }
    setCheckingOnboarding(true);
    setMfaChecking(true);
    setMfaRequired(false);

    resolveOnboardingStatus(user.id)
      .then(({ completed, companyId }) => {
        if (cancelled) return;
        if (completed && companyId) setContext("pj", companyId);
        setOnboardingCompleted(completed);
        setCheckingOnboarding(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[onboarding] falha ao resolver status", error);
        setOnboardingCompleted(false);
        setCheckingOnboarding(false);
      });
    Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([{ data: aal }]) => {
      if (cancelled) return;
      const needsAal2 = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
      if (needsAal2) {
        setMfaRequired(true);
      }
      setMfaChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [setContext, user?.id]);

  if (loading || checkingOnboarding || mfaChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }
  if (mfaRequired) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }
  if (onboardingCompleted === false) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

/**
 * Guarda do wizard de onboarding.
 *
 * Se o onboarding já está concluído, redireciona para `/hub` para evitar
 * loop de cadastro em contas existentes.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { setContext } = useCompanyContext();
  const [checking, setChecking] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCompleted(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    resolveOnboardingStatus(user.id)
      .then(({ completed, companyId }) => {
        if (cancelled) return;
        if (completed && companyId) setContext("pj", companyId);
        setCompleted(completed);
        setChecking(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[onboarding] falha ao verificar acesso ao wizard", error);
        setCompleted(false);
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setContext, user?.id]);

  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (completed) return <Navigate to="/hub" replace />;
  return <>{children}</>;
}
