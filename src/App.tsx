import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PrivacyProvider } from "@/hooks/usePrivacy";
import { CompanyContextProvider, useCompanyContext } from "@/hooks/useCompanyContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { usePageviewTracking } from "@/hooks/usePageviewTracking";
import Auth from "./pages/Auth";
import Hub from "./pages/Hub";
import { ModuleGuard } from "@/components/modules/ModuleGuard";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { DpLayout } from "@/components/dp/DpLayout";
import DpHome from "./pages/dp/DpHome";
import DpColaboradores from "./pages/dp/DpColaboradores";
import DpSolicitacoes from "./pages/dp/DpSolicitacoes";
import DpDocumentos from "./pages/dp/DpDocumentos";
import DpDocumentosHub from "./pages/dp/DpDocumentosHub";
import DpFolgas from "./pages/dp/DpFolgas";
import DpCadastrosHub from "./pages/dp/DpCadastrosHub";
import DpUnidades from "./pages/dp/DpUnidades";
import DpCargos from "./pages/dp/DpCargos";
import DpSindicatos from "./pages/dp/DpSindicatos";
import DpSindicatoNegociacoes from "./pages/dp/DpSindicatoNegociacoes";
import DpAprovacoes from "./pages/dp/DpAprovacoes";
import DpAvisos from "./pages/dp/DpAvisos";
import DpMensagens from "./pages/dp/DpMensagens";
import DpDisciplinar from "./pages/dp/DpDisciplinar";
import DpBloqueios from "./pages/dp/DpBloqueios";
import DpTrocas from "./pages/dp/DpTrocas";
import DpFolhaHub from "./pages/dp/DpFolhaHub";
import DpFolhaPeriodo from "./pages/dp/DpFolhaPeriodo";
import DpFolhaAprovacoes from "./pages/dp/DpFolhaAprovacoes";
import { ColaboradorShell } from "./components/dp/ColaboradorShell";
import DpMeuHome from "./pages/dp/portal/DpMeuHome";
import DpMeuPerfil from "./pages/dp/portal/DpMeuPerfil";
import DpMeuDocumentos from "./pages/dp/portal/DpMeuDocumentos";
import DpMeuSolicitacoes from "./pages/dp/portal/DpMeuSolicitacoes";
import DpMeuTrocas from "./pages/dp/portal/DpMeuTrocas";
import AdminModulos from "./pages/admin/Modulos";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Lancamentos from "./pages/Lancamentos";


import FluxoCaixa from "./pages/FluxoCaixa";
import Orcamento from "./pages/Orcamento";
import Relatorios from "./pages/Relatorios";
import RelatoriosContabeis from "./pages/relatorios/Contabeis";
import Contatos from "./pages/Contatos";
import Categorias from "./pages/Categorias";
import ContasContabeis from "./pages/ContasContabeis";
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
import AdminLandingPage from "./pages/admin/LandingPage";
import AdminBancos from "./pages/admin/Bancos";
import AdminSeoIndexacao from "./pages/admin/SeoIndexacao";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import Planos from "./pages/Planos";
import Checkout from "./pages/Checkout";
import CheckoutPagamento from "./pages/CheckoutPagamento";
import Faturas from "./pages/Faturas";
import NotFound from "./pages/NotFound";
import Landing from "./pages/Landing";
import Unsubscribe from "./pages/Unsubscribe";
import Privacidade from "./pages/legal/Privacidade";
import Termos from "./pages/legal/Termos";
import CookiesPage from "./pages/legal/Cookies";
import EncarregadoDados from "./pages/legal/EncarregadoDados";
import DasMei from "./pages/guias/DasMei";
import Buscar from "./pages/Buscar";
import AdminDocumentosLegais from "./pages/admin/DocumentosLegais";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import { HelmetProvider } from "react-helmet-async";
import { CanonicalUrl } from "@/components/seo/CanonicalUrl";
import { SuperAdminRoute } from "@/components/admin/SuperAdminRoute";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import TrialExpired from "./pages/TrialExpired";
import { resolveOnboardingStatus } from "@/lib/onboardingStatus";
import { ProtectedRoute, OnboardingGuard } from "@/routes/onboardingGuards";

// Rotas acessíveis mesmo com trial/assinatura expirada
const TRIAL_EXPIRED_WHITELIST = [
  "/trial-expirado",
  "/planos",
  "/checkout",
  "/faturas",
  "/admin",
];

function isWhitelistedForExpiredTrial(pathname: string) {
  return TRIAL_EXPIRED_WHITELIST.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: sub, isLoading } = useCurrentSubscription();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();

  if (isLoading || roleLoading) return <>{children}</>;
  if (isSuperAdmin) return <>{children}</>;
  if (!sub?.isBlocked) return <>{children}</>;
  if (isWhitelistedForExpiredTrial(location.pathname)) return <>{children}</>;

  return <Navigate to="/trial-expirado" replace />;
}

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
  if (!value) return "/hub";
  if (!value.startsWith("/") || value.startsWith("//")) return "/hub";
  return value;
}

function useIsDpColaborador() {
  const { user } = useAuth();
  const [is, setIs] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) { setIs(false); return; }
    supabase.rpc("is_dp_colaborador", { _user_id: user.id }).then(({ data }) => setIs(!!data));
  }, [user?.id]);
  return is;
}

function useIsAdminOrOwner() {
  const { user } = useAuth();
  const [is, setIs] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) { setIs(false); return; }
    (async () => {
      const [roleRes, ownerRes, memberRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle(),
        supabase.from("companies").select("id").eq("user_id", user.id).limit(1),
        supabase.from("company_members").select("role").eq("user_id", user.id).in("role", ["owner", "admin"]).limit(1),
      ]);
      const hasSuper = !!roleRes.data;
      const hasOwn = !!(ownerRes.data && ownerRes.data.length > 0);
      const hasAdminMember = !!(memberRes.data && memberRes.data.length > 0);
      setIs(hasSuper || hasOwn || hasAdminMember);
    })();
  }, [user?.id]);
  return is;
}

function RootGate() {
  const { user, loading } = useAuth();
  const isColab = useIsDpColaborador();
  const isAdminOrOwner = useIsAdminOrOwner();
  if (loading || (user && (isColab === null || isAdminOrOwner === null))) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  // super_admin / owner / admin sempre vão ao Hub, mesmo com vínculo residual em dp_colaboradores
  if (user && isAdminOrOwner) return <Navigate to="/hub" replace />;
  if (user && isColab) return <Navigate to="/dp/meu" replace />;
  if (user) return <Navigate to="/hub" replace />;
  return <Landing />;
}

function PortalProtected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
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
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

function OnboardingGuard({ children }: { children: React.ReactNode }) {
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
    let cancelled = false;
    Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([{ data: aal }]) => {
      if (cancelled) return;
      const needsAal2 = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
      setMfaRequired(needsAal2);
      setMfaChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
    <Route path="/dp/meu" element={<PortalProtected><ColaboradorShell /></PortalProtected>}>
      <Route index element={<DpMeuHome />} />
      <Route path="perfil" element={<DpMeuPerfil />} />
      <Route path="documentos" element={<DpMeuDocumentos />} />
      <Route path="solicitacoes" element={<DpMeuSolicitacoes />} />
      <Route path="trocas" element={<DpMeuTrocas />} />
    </Route>
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
          <SubscriptionGuard>
            <AppLayout />
          </SubscriptionGuard>
        </ProtectedRoute>
      }
    >
      <Route path="/hub" element={<Hub />} />
      <Route path="/dashboard" element={<Dashboard />} />
      
      <Route path="/lancamentos" element={<Lancamentos />} />
      
      <Route path="/fluxo-caixa" element={<FluxoCaixa />} />
      <Route path="/orcamento" element={<Orcamento />} />
      <Route path="/relatorios" element={<Relatorios />} />
      <Route path="/relatorios/contabeis" element={<RelatoriosContabeis />} />
      <Route path="/contatos" element={<Contatos />} />
      <Route path="/categorias" element={<Categorias />} />
      <Route path="/contas-contabeis" element={<ContasContabeis />} />
      <Route path="/contas-bancarias" element={<ContasBancarias />} />
      <Route path="/configuracoes" element={<Configuracoes />} />
      <Route path="/gestao-usuarios" element={<GestaoUsuarios />} />
      <Route path="/empresas" element={<Empresas />} />
      <Route path="/formas-pagamento" element={<FormasPagamento />} />
      {/* Módulos em contratação avulsa */}
      <Route path="/crm" element={<ModuleGuard module="crm"><ModulePlaceholder module="crm" /></ModuleGuard>} />
      <Route path="/rh" element={<ModuleGuard module="rh"><ModulePlaceholder module="rh" /></ModuleGuard>} />
      <Route path="/pedidos" element={<ModuleGuard module="pedidos"><ModulePlaceholder module="pedidos" /></ModuleGuard>} />
    </Route>
    {/* DP 360° — shell próprio (fora do AppLayout do Financeiro) */}
    <Route
      path="/dp"
      element={
        <ProtectedRoute>
          <SubscriptionGuard>
            <ModuleGuard module="dp"><DpLayout /></ModuleGuard>
          </SubscriptionGuard>
        </ProtectedRoute>
      }
    >
      <Route index element={<DpHome />} />
      <Route path="colaboradores" element={<DpColaboradores />} />
      <Route path="solicitacoes" element={<DpSolicitacoes />} />
      <Route path="folgas" element={<DpFolgas />} />
      <Route path="documentos" element={<DpDocumentosHub />} />
      <Route path="documentos/todos" element={<DpDocumentos />} />
      <Route path="documentos/:categoria" element={<DpDocumentos />} />
      <Route path="avisos" element={<DpAvisos />} />
      <Route path="mensagens" element={<DpMensagens />} />
      <Route path="disciplinar" element={<DpDisciplinar />} />
      <Route path="bloqueios" element={<DpBloqueios />} />
      <Route path="trocas" element={<DpTrocas />} />
      <Route path="aprovacoes" element={<DpAprovacoes />} />
      <Route path="cadastros" element={<DpCadastrosHub />} />
      <Route path="cadastros/unidades" element={<DpUnidades />} />
      <Route path="cadastros/cargos" element={<DpCargos />} />
      <Route path="cadastros/sindicatos" element={<DpSindicatos />} />
      <Route path="sindicatos/negociacoes" element={<DpSindicatoNegociacoes />} />
      <Route path="folha" element={<DpFolhaHub />} />
      <Route path="folha/aprovacoes" element={<DpFolhaAprovacoes />} />
      <Route path="folha/periodos/:id" element={<DpFolhaPeriodo />} />
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
      <Route path="/admin/landing-page" element={<AdminLandingPage />} />
      <Route path="/admin/documentos-legais" element={<AdminDocumentosLegais />} />
      <Route path="/admin/bancos" element={<AdminBancos />} />
      <Route path="/admin/seo-indexacao" element={<AdminSeoIndexacao />} />
      <Route path="/admin/modulos" element={<AdminModulos />} />
    </Route>
    <Route path="/convite/:token" element={<AcceptInvite />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/privacidade" element={<Privacidade />} />
    <Route path="/termos" element={<Termos />} />
    <Route path="/cookies" element={<CookiesPage />} />
    <Route path="/encarregado-dados" element={<EncarregadoDados />} />
    <Route path="/guias/das-mei" element={<DasMei />} />
    <Route path="/buscar" element={<Buscar />} />
    <Route path="/dpo" element={<Navigate to="/encarregado-dados" replace />} />
    <Route path="/unsubscribe" element={<Unsubscribe />} />
    <Route path="/planos" element={<ProtectedRoute><Planos /></ProtectedRoute>} />
    <Route path="/checkout/:planSlug" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
    <Route path="/checkout/pagamento/:invoiceId" element={<ProtectedRoute><CheckoutPagamento /></ProtectedRoute>} />
    <Route path="/faturas" element={<ProtectedRoute><Faturas /></ProtectedRoute>} />
    <Route path="/trial-expirado" element={<ProtectedRoute><TrialExpired /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const AppShell = () => {
  useVisualViewport();
  usePageviewTracking();
  return (
    <>
      <AppRoutes />
      <CookieConsentBanner />
    </>
  );
};

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CanonicalUrl />
          <AuthProvider>
            <CompanyContextProvider>
              <PrivacyProvider>
                <AppShell />
              </PrivacyProvider>
            </CompanyContextProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
