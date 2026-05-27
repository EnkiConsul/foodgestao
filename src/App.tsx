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
import { AdminLayout } from "@/components/layout/AdminLayout";
import AdminEstatisticas from "./pages/admin/Estatisticas";
import AdminClientes from "./pages/admin/Clientes";
import AdminPlanosPage from "./pages/admin/Planos";
import AdminAssinaturas from "./pages/admin/Assinaturas";
import AdminFaturamento from "./pages/admin/Faturamento";
import AdminCuponsPage from "./pages/admin/Cupons";
import AdminFaturasPage from "./pages/admin/Faturas";
import AdminWebhooksAsaasPage from "./pages/admin/WebhooksAsaas";
import AdminPerfisAcesso from "./pages/admin/PerfisAcesso";
import AdminAuditoria from "./pages/admin/Auditoria";
import AdminResetarDados from "./pages/admin/ResetarDados";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import Planos from "./pages/Planos";
import Checkout from "./pages/Checkout";
import CheckoutPagamento from "./pages/CheckoutPagamento";
import Faturas from "./pages/Faturas";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
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
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function RootGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
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
  }, [user?.id]);

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
    <Route path="/" element={<RootGate />} />
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
      <Route path="/dashboard" element={<Dashboard />} />
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
    </Route>
    <Route
      element={
        <ProtectedRoute>
          <SuperAdminRoute>
            <AdminLayout />
          </SuperAdminRoute>
        </ProtectedRoute>
      }
    >
      <Route path="/admin" element={<Navigate to="/admin/estatisticas" replace />} />
      <Route path="/admin/estatisticas" element={<AdminEstatisticas />} />
      <Route path="/admin/clientes" element={<AdminClientes />} />
      <Route path="/admin/planos" element={<AdminPlanosPage />} />
      <Route path="/admin/assinaturas" element={<AdminAssinaturas />} />
      <Route path="/admin/faturamento" element={<AdminFaturamento />} />
      <Route path="/admin/cupons" element={<AdminCuponsPage />} />
      <Route path="/admin/faturas" element={<AdminFaturasPage />} />
      <Route path="/admin/webhooks-asaas" element={<AdminWebhooksAsaasPage />} />
      <Route path="/admin/perfis-acesso" element={<AdminPerfisAcesso />} />
      <Route path="/admin/auditoria" element={<AdminAuditoria />} />
      <Route path="/admin/resetar-dados" element={<AdminResetarDados />} />
    </Route>
    <Route path="/convite/:token" element={<AcceptInvite />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/planos" element={<ProtectedRoute><Planos /></ProtectedRoute>} />
    <Route path="/checkout/:planSlug" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
    <Route path="/checkout/pagamento/:invoiceId" element={<ProtectedRoute><CheckoutPagamento /></ProtectedRoute>} />
    <Route path="/faturas" element={<ProtectedRoute><Faturas /></ProtectedRoute>} />
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
