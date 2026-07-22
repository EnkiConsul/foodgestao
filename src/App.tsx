import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PrivacyProvider } from "@/hooks/usePrivacy";
import { CompanyContextProvider } from "@/hooks/useCompanyContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { usePageviewTracking } from "@/hooks/usePageviewTracking";
import { ModuleGuard } from "@/components/modules/ModuleGuard";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { DpLayout } from "@/components/dp/DpLayout";
import { ColaboradorShell } from "./components/dp/ColaboradorShell";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import { HelmetProvider } from "react-helmet-async";
import { CanonicalUrl } from "@/components/seo/CanonicalUrl";
import { SuperAdminRoute } from "@/components/admin/SuperAdminRoute";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { ProtectedRoute, OnboardingGuard } from "@/routes/onboardingGuards";
import { PageSpinner } from "@/components/PageSpinner";

// Eager: rotas do primeiro paint (landing/auth/hub/dashboard)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
const DpLogin = lazy(() => import("./pages/dp/DpLogin"));
import Hub from "./pages/Hub";
import Dashboard from "./pages/Dashboard";

// Lazy: tudo mais
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Lancamentos = lazy(() => import("./pages/Lancamentos"));
const FluxoCaixa = lazy(() => import("./pages/FluxoCaixa"));
const Orcamento = lazy(() => import("./pages/Orcamento"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const RelatoriosContabeis = lazy(() => import("./pages/relatorios/Contabeis"));
const Contatos = lazy(() => import("./pages/Contatos"));
const Categorias = lazy(() => import("./pages/Categorias"));
const ContasContabeis = lazy(() => import("./pages/ContasContabeis"));
const ContasBancarias = lazy(() => import("./pages/ContasBancarias"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const GestaoUsuarios = lazy(() => import("./pages/GestaoUsuarios"));
const Empresas = lazy(() => import("./pages/Empresas"));
const FormasPagamento = lazy(() => import("./pages/FormasPagamento"));
const CartoesCredito = lazy(() => import("./pages/CartoesCredito"));
const CategorizacaoIA = lazy(() => import("./pages/CategorizacaoIA"));

// DP admin
const DpHome = lazy(() => import("./pages/dp/DpHome"));
const DpColaboradores = lazy(() => import("./pages/dp/DpColaboradores"));
const DpSolicitacoes = lazy(() => import("./pages/dp/DpSolicitacoes"));
const DpDocumentos = lazy(() => import("./pages/dp/DpDocumentos"));
const DpDocumentosHub = lazy(() => import("./pages/dp/DpDocumentosHub"));
const DpDocumentosPorTipo = lazy(() => import("./pages/dp/DpDocumentosPorTipo"));
const DpFolgas = lazy(() => import("./pages/dp/DpFolgas"));
const DpFolgasHub = lazy(() => import("./pages/dp/DpFolgasHub"));
const DpCadastrosHub = lazy(() => import("./pages/dp/DpCadastrosHub"));
const DpUnidades = lazy(() => import("./pages/dp/DpUnidades"));
const DpCargos = lazy(() => import("./pages/dp/DpCargos"));
const DpSindicatos = lazy(() => import("./pages/dp/DpSindicatos"));
const DpSindicatoNegociacoes = lazy(() => import("./pages/dp/DpSindicatoNegociacoes"));
const DpAprovacoes = lazy(() => import("./pages/dp/DpAprovacoes"));
const DpAvisos = lazy(() => import("./pages/dp/DpAvisos"));
const DpMensagens = lazy(() => import("./pages/dp/DpMensagens"));
const DpDisciplinar = lazy(() => import("./pages/dp/DpDisciplinar"));
const DpBloqueios = lazy(() => import("./pages/dp/DpBloqueios"));
const DpTrocas = lazy(() => import("./pages/dp/DpTrocas"));
const DpConfiguracoes = lazy(() => import("./pages/dp/DpConfiguracoes"));
const DpAdminCalendario = lazy(() => import("./pages/dp/DpAdminCalendario"));
const DpModelosMensagem = lazy(() => import("./pages/dp/DpModelosMensagem"));
const DpDocImportBulk = lazy(() => import("./pages/dp/DpDocImportBulk"));
const DpComunicacaoHub = lazy(() => import("./pages/dp/DpComunicacaoHub"));
const DpAtestados = lazy(() => import("./pages/dp/DpAtestados"));
const DpHistoricoCompleto = lazy(() => import("./pages/dp/DpHistoricoCompleto"));
const DpNotificacoes = lazy(() => import("./pages/dp/DpNotificacoes"));

// DP portal
const DpMeuHome = lazy(() => import("./pages/dp/portal/DpMeuHome"));
const DpMeuPerfil = lazy(() => import("./pages/dp/portal/DpMeuPerfil"));
const DpMeuDocumentos = lazy(() => import("./pages/dp/portal/DpMeuDocumentos"));
const DpMeuSolicitacoes = lazy(() => import("./pages/dp/portal/DpMeuSolicitacoes"));
const DpMeuTrocas = lazy(() => import("./pages/dp/portal/DpMeuTrocas"));
const DpMeuCalendario = lazy(() => import("./pages/dp/portal/DpMeuCalendario"));
const DpMeuAtestados = lazy(() => import("./pages/dp/portal/DpMeuAtestados"));
const DpMeuDisciplinar = lazy(() => import("./pages/dp/portal/DpMeuDisciplinar"));
const DpMeuSindicato = lazy(() => import("./pages/dp/portal/DpMeuSindicato"));
const DpMeuHistorico = lazy(() => import("./pages/dp/portal/DpMeuHistorico"));

// Admin
const AdminModulos = lazy(() => import("./pages/admin/Modulos"));
const AdminEstatisticas = lazy(() => import("./pages/admin/Estatisticas"));
const AdminClientes = lazy(() => import("./pages/admin/Clientes"));
const AdminPlanosPage = lazy(() => import("./pages/admin/Planos"));
const AdminAssinaturas = lazy(() => import("./pages/admin/Assinaturas"));
const AdminFaturamento = lazy(() => import("./pages/admin/Faturamento"));
const AdminCuponsPage = lazy(() => import("./pages/admin/Cupons"));
const AdminFaturasPage = lazy(() => import("./pages/admin/Faturas"));
const AdminWebhooksAsaasPage = lazy(() => import("./pages/admin/WebhooksAsaas"));
const AdminPerfisAcesso = lazy(() => import("./pages/admin/PerfisAcesso"));
const AdminAuditoria = lazy(() => import("./pages/admin/Auditoria"));
const AdminResetarDados = lazy(() => import("./pages/admin/ResetarDados"));
const AdminLandingPage = lazy(() => import("./pages/admin/LandingPage"));
const AdminBancos = lazy(() => import("./pages/admin/Bancos"));
const AdminOpenFinance = lazy(() => import("./pages/admin/OpenFinance"));
const AdminSeoIndexacao = lazy(() => import("./pages/admin/SeoIndexacao"));

const AdminDocumentosLegais = lazy(() => import("./pages/admin/DocumentosLegais"));

// Público / auth-adjacente
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Planos = lazy(() => import("./pages/Planos"));
const Checkout = lazy(() => import("./pages/Checkout"));
const CheckoutPagamento = lazy(() => import("./pages/CheckoutPagamento"));
const Faturas = lazy(() => import("./pages/Faturas"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Privacidade = lazy(() => import("./pages/legal/Privacidade"));
const Termos = lazy(() => import("./pages/legal/Termos"));
const CookiesPage = lazy(() => import("./pages/legal/Cookies"));
const EncarregadoDados = lazy(() => import("./pages/legal/EncarregadoDados"));
const DasMei = lazy(() => import("./pages/guias/DasMei"));
const Buscar = lazy(() => import("./pages/Buscar"));
const TrialExpired = lazy(() => import("./pages/TrialExpired"));

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
      staleTime: 30_000,
      gcTime: 5 * 60_000,
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
    return <PageSpinner />;
  }
  if (user && isAdminOrOwner) return <Navigate to="/hub" replace />;
  if (user && isColab) return <Navigate to="/dp/meu" replace />;
  if (user) return <Navigate to="/hub" replace />;
  return <Landing />;
}

function PortalProtected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner />;
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }
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

  if (loading || (user && mfaChecking)) return <PageSpinner />;

  if (user && !mfaRequired) {
    return <Navigate to={safeRedirect(searchParams.get("redirect"))} replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Suspense fallback={<PageSpinner />}>
    <Routes>
      <Route path="/" element={<RootGate />} />
      <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
      <Route path="/dp/login" element={<PublicOnlyRoute><DpLogin /></PublicOnlyRoute>} />
      <Route path="/dp/meu" element={<PortalProtected><ColaboradorShell /></PortalProtected>}>
        <Route index element={<DpMeuHome />} />
        <Route path="perfil" element={<DpMeuPerfil />} />
        <Route path="cadastro" element={<DpMeuPerfil />} />
        <Route path="documentos" element={<DpMeuDocumentos />} />
        <Route path="solicitacoes" element={<DpMeuSolicitacoes />} />
        <Route path="trocas" element={<DpMeuTrocas />} />
        <Route path="calendario" element={<DpMeuCalendario />} />
        <Route path="atestados" element={<DpMeuAtestados />} />
        <Route path="disciplinar" element={<DpMeuDisciplinar />} />
        <Route path="sindicato" element={<DpMeuSindicato />} />
        <Route path="historico" element={<DpMeuHistorico />} />
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
        <Route path="/cartoes-credito" element={<CartoesCredito />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/gestao-usuarios" element={<GestaoUsuarios />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/formas-pagamento" element={<FormasPagamento />} />
        <Route path="/crm" element={<ModuleGuard module="crm"><ModulePlaceholder module="crm" /></ModuleGuard>} />
        <Route path="/rh" element={<ModuleGuard module="rh"><ModulePlaceholder module="rh" /></ModuleGuard>} />
        <Route path="/pedidos" element={<ModuleGuard module="pedidos"><ModulePlaceholder module="pedidos" /></ModuleGuard>} />
      </Route>
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
        <Route path="folgas" element={<DpFolgasHub />} />
        <Route path="folgas/calendario" element={<DpFolgas />} />
        <Route path="calendario" element={<DpAdminCalendario />} />
        <Route path="documentos" element={<DpDocumentosHub />} />
        <Route path="documentos/todos" element={<DpDocumentos />} />
        <Route path="documentos/historico" element={<DpHistoricoCompleto />} />
        <Route path="documentos/contracheque" element={<DpDocumentosPorTipo tipo="contracheque" />} />
        <Route path="documentos/ponto" element={<DpDocumentosPorTipo tipo="ponto" />} />
        <Route path="documentos/adiantamento" element={<DpDocumentosPorTipo tipo="adiantamento" />} />
        <Route path="documentos/:categoria" element={<DpDocumentos />} />
        <Route path="atestados" element={<DpAtestados />} />
        <Route path="avisos" element={<DpAvisos />} />
        <Route path="mensagens" element={<DpMensagens />} />
        <Route path="modelos-mensagem" element={<DpModelosMensagem />} />
        <Route path="comunicacao" element={<DpComunicacaoHub />} />
        <Route path="notificacoes" element={<DpNotificacoes />} />
        <Route path="disciplinar" element={<DpDisciplinar />} />
        <Route path="bloqueios" element={<DpBloqueios />} />
        <Route path="trocas" element={<DpTrocas />} />
        <Route path="aprovacoes" element={<DpAprovacoes />} />
        <Route path="documentos/importar" element={<DpDocImportBulk />} />
        <Route path="cadastros" element={<DpCadastrosHub />} />
        <Route path="cadastros/unidades" element={<DpUnidades />} />
        <Route path="cadastros/cargos" element={<DpCargos />} />
        <Route path="cadastros/sindicatos" element={<DpSindicatos />} />
        <Route path="documentos/act-cct" element={<DpSindicatoNegociacoes />} />
        <Route path="configuracoes" element={<DpConfiguracoes />} />
        <Route path="sindicatos" element={<Navigate to="/dp/cadastros/sindicatos" replace />} />
        <Route path="unidades" element={<Navigate to="/dp/cadastros/unidades" replace />} />
        <Route path="cargos" element={<Navigate to="/dp/cadastros/cargos" replace />} />
        <Route path="sindicatos/negociacoes" element={<Navigate to="/dp/documentos/act-cct" replace />} />
        <Route path="cadastros/sindicatos/negociacoes" element={<Navigate to="/dp/documentos/act-cct" replace />} />
        <Route path="documentos/sindicato" element={<Navigate to="/dp/documentos/act-cct" replace />} />
        <Route path="comunicacao/avisos" element={<Navigate to="/dp/avisos" replace />} />
        <Route path="comunicacao/mensagens" element={<Navigate to="/dp/mensagens" replace />} />
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
        <Route path="/admin/categorizacao-ia" element={<CategorizacaoIA />} />
        
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
  </Suspense>
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
