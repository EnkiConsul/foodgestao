import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { resolveOnboardingStatus } from "@/lib/onboardingStatus";
import { resolveLandingTarget, PORTAL_PATH } from "@/lib/auth/landing";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/errorLog";

/** Tempo máximo de espera das verificações de entrada antes de oferecer saída. */
const GUARD_TIMEOUT_MS = 10_000;

/**
 * Tela de espera das guardas de rota.
 *
 * Sem limite de tempo, qualquer verificação que não responda deixa o usuário
 * preso na bolinha girando em tela cheia. Passado o limite, registramos o erro
 * (com a verificação pendente) e oferecemos recuperação.
 */
function GuardWaiting({ pending, scope }: { pending: string; scope: string }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    const id = window.setTimeout(() => {
      setTimedOut(true);
      void reportError({
        error: new Error(`Verificação de entrada não respondeu: ${pending}`),
        surface: scope,
        action: `aguardar verificação (${pending})`,
        source: "client",
        userMessage: "A verificação de acesso demorou demais.",
        details: { pending, timeoutMs: GUARD_TIMEOUT_MS },
      });
    }, GUARD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [pending, scope]);

  if (!timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold">Não conseguimos concluir a verificação</h1>
        <p className="text-sm text-muted-foreground">
          A checagem do seu acesso está demorando mais que o normal. Tente novamente ou
          volte ao início.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <a href="/hub">Ir para o Hub</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Colaborador (sem ser dono/administrador) nunca deve ver o assistente de
 * cadastro de empresa: o destino dele é sempre o portal do colaborador.
 */
function usePortalOnlyUser(userId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ checking: boolean; isPortalOnly: boolean }>({
    checking: !!userId && enabled,
    isPortalOnly: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!userId || !enabled) {
      setState({ checking: false, isPortalOnly: false });
      return;
    }
    setState({ checking: true, isPortalOnly: false });
    resolveLandingTarget(userId)
      .then((landing) => {
        if (cancelled) return;
        setState({ checking: false, isPortalOnly: landing.kind === "portal" });
      })
      .catch(() => {
        if (!cancelled) setState({ checking: false, isPortalOnly: false });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return state;
}

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
  const { setContext, selectedCompanyId } = useCompanyContext();
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
        // Só semeia a empresa quando ainda não há escolha do usuário: caso
        // contrário, cada navegação/recarga sobrescrevia a empresa
        // selecionada no seletor do topo.
        if (completed && companyId && !selectedCompanyId) setContext("pj", companyId);
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
  }, [setContext, selectedCompanyId, user?.id]);

  const portal = usePortalOnlyUser(user?.id, onboardingCompleted === false);

  if (loading || checkingOnboarding || mfaChecking || portal.checking) {
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
  if (onboardingCompleted === false) {
    if (portal.isPortalOnly) return <Navigate to={PORTAL_PATH} replace />;
    return <Navigate to="/onboarding" replace />;
  }

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
  const { setContext, selectedCompanyId } = useCompanyContext();
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
        // Só semeia a empresa quando ainda não há escolha do usuário: caso
        // contrário, cada navegação/recarga sobrescrevia a empresa
        // selecionada no seletor do topo.
        if (completed && companyId && !selectedCompanyId) setContext("pj", companyId);
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
  }, [setContext, selectedCompanyId, user?.id]);

  const portal = usePortalOnlyUser(user?.id, !!user && !completed);

  if (loading || checking || portal.checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (completed) return <Navigate to="/hub" replace />;
  if (portal.isPortalOnly) return <Navigate to={PORTAL_PATH} replace />;
  return <>{children}</>;
}
