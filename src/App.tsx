import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PrivacyProvider } from "@/hooks/usePrivacy";
import { CompanyContextProvider } from "@/hooks/useCompanyContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Lancamentos from "./pages/Lancamentos";

import FluxoCaixa from "./pages/FluxoCaixa";
import Orcamento from "./pages/Orcamento";
import Relatorios from "./pages/Relatorios";
import Contatos from "./pages/Contatos";
import Categorias from "./pages/Categorias";
import ContasBancarias from "./pages/ContasBancarias";
import Configuracoes from "./pages/Configuracoes";
import GestaoUsuarios from "./pages/GestaoUsuarios";
import Empresas from "./pages/Empresas";
import FormasPagamento from "./pages/FormasPagamento";
import Admin from "./pages/Admin";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import Planos from "./pages/Planos";
import Checkout from "./pages/Checkout";
import NotFound from "./pages/NotFound";
import { SuperAdminRoute } from "@/components/admin/SuperAdminRoute";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduz refetches desnecessários e melhora cache em listagens
      staleTime: 30_000, // 30s — dados considerados frescos
      gcTime: 5 * 60_000, // 5min em cache após desuso
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

function safeRedirect(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [mfaChecking, setMfaChecking] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    if (!user) {
      setCheckingOnboarding(false);
      setMfaChecking(false);
      return;
    }
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setOnboardingCompleted(data?.onboarding_completed ?? false);
        setCheckingOnboarding(false);
      });
    Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]).then(([{ data: aal }, { data: factors }]) => {
      const hasVerified = (factors?.totp ?? []).some((f) => f.status === "verified");
      const needsAal2 = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
      if (!hasVerified || needsAal2) {
        setMfaRequired(true);
      }
      setMfaChecking(false);
    });
  }, [user]);

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

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [mfaChecking, setMfaChecking] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    if (!user) {
      setMfaChecking(false);
      setMfaRequired(false);
      return;
    }
    setMfaChecking(true);
    Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]).then(([{ data: aal }, { data: factors }]) => {
      const hasVerified = (factors?.totp ?? []).some((f) => f.status === "verified");
      const needsAal2 = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
      setMfaRequired(!hasVerified || needsAal2);
      setMfaChecking(false);
    });
  }, [user]);

  if (loading || (user && mfaChecking)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user && !mfaRequired) {
    return <Navigate to={safeRedirect(searchParams.get("redirect"))} replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
    <Route
      path="/onboarding"
      element={
        <OnboardingGuard>
          <Onboarding />
        </OnboardingGuard>
      }
    />
    <Route
      element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Dashboard />} />
      <Route path="/lancamentos" element={<Lancamentos />} />
      
      <Route path="/fluxo-caixa" element={<FluxoCaixa />} />
      <Route path="/orcamento" element={<Orcamento />} />
      <Route path="/relatorios" element={<Relatorios />} />
      <Route path="/contatos" element={<Contatos />} />
      <Route path="/categorias" element={<Categorias />} />
      <Route path="/contas-bancarias" element={<ContasBancarias />} />
      <Route path="/configuracoes" element={<Configuracoes />} />
      <Route path="/gestao-usuarios" element={<GestaoUsuarios />} />
      <Route path="/empresas" element={<Empresas />} />
      <Route path="/formas-pagamento" element={<FormasPagamento />} />
      <Route path="/admin" element={<SuperAdminRoute><Admin /></SuperAdminRoute>} />
    </Route>
    <Route path="/convite/:token" element={<AcceptInvite />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompanyContextProvider>
            <PrivacyProvider>
              <AppRoutes />
            </PrivacyProvider>
          </CompanyContextProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
