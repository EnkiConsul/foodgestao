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
import { ModuloEmDesenvolvimentoGate } from "@/components/dp/ModuloEmDesenvolvimentoGate";

import { ColaboradorShell } from "./components/dp/ColaboradorShell";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import { HelmetProvider } from "react-helmet-async";
import { CanonicalUrl } from "@/components/seo/CanonicalUrl";
import { SuperAdminRoute } from "@/components/admin/SuperAdminRoute";
import { useEffect, useState, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { ProtectedRoute, OnboardingGuard } from "@/routes/onboardingGuards";
import { PageSpinner } from "@/components/PageSpinner";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installGlobalErrorHandlers } from "@/lib/logger";

installGlobalErrorHandlers();


// Eager: rotas do primeiro paint (auth/hub/dashboard)
import Auth from "./pages/Auth";
const PrimeiroAcesso = lazyWithRetry(() => import("./pages/PrimeiroAcesso"));
const EsqueciSenha = lazyWithRetry(() => import("./pages/EsqueciSenha"));
import Hub from "./pages/Hub";
import Dashboard from "./pages/Dashboard";

// Lazy: tudo mais
const Onboarding = lazyWithRetry(() => import("./pages/Onboarding"));
const Lancamentos = lazyWithRetry(() => import("./pages/Lancamentos"));
const FluxoCaixa = lazyWithRetry(() => import("./pages/FluxoCaixa"));
const Orcamento = lazyWithRetry(() => import("./pages/Orcamento"));
const RelatoriosContabeis = lazyWithRetry(() => import("./pages/relatorios/Contabeis"));
const RelatorioFluxoCaixa = lazyWithRetry(() => import("./pages/relatorios/FluxoCaixa"));
const Contatos = lazyWithRetry(() => import("./pages/Contatos"));
const Categorias = lazyWithRetry(() => import("./pages/Categorias"));
const ContasContabeis = lazyWithRetry(() => import("./pages/ContasContabeis"));
const ContasBancarias = lazyWithRetry(() => import("./pages/ContasBancarias"));
const ConciliacaoPluggy = lazyWithRetry(() => import("./pages/ConciliacaoPluggy"));
const ConexoesPluggy = lazyWithRetry(() => import("./pages/ConexoesPluggy"));
const ExtratoConciliacao = lazyWithRetry(() => import("./pages/ExtratoConciliacao"));
const Configuracoes = lazyWithRetry(() => import("./pages/Configuracoes"));
const GestaoUsuarios = lazyWithRetry(() => import("./pages/GestaoUsuarios"));
const Empresas = lazyWithRetry(() => import("./pages/Empresas"));
const FormasPagamento = lazyWithRetry(() => import("./pages/FormasPagamento"));
const CentrosCusto = lazyWithRetry(() => import("./pages/CentrosCusto"));
const CartoesCredito = lazyWithRetry(() => import("./pages/CartoesCredito"));
const PedidosModulo = lazyWithRetry(() => import("./pages/pedidos/PedidosModulo"));
const PedidosOnboarding = lazyWithRetry(() => import("./pages/pedidos/PedidosOnboarding"));
const PedidosCardapio = lazyWithRetry(() => import("./pages/pedidos/PedidosCardapio"));
const PedidosAssinatura = lazyWithRetry(() => import("./pages/pedidos/PedidosAssinatura"));
const PedidosCentral = lazyWithRetry(() => import("./pages/pedidos/PedidosCentral"));
const CozinhaCentral = lazyWithRetry(() => import("./pages/pedidos/CozinhaCentral"));
const ExpedicaoCentral = lazyWithRetry(() => import("./pages/pedidos/ExpedicaoCentral"));
const PedidosIntegracoes = lazyWithRetry(() => import("./pages/pedidos/PedidosIntegracoes"));
const PedidosRelatorios = lazyWithRetry(() => import("./pages/pedidos/PedidosRelatorios"));

const CategorizacaoIA = lazyWithRetry(() => import("./pages/CategorizacaoIA"));
const Mais = lazyWithRetry(() => import("./pages/Mais"));


// DP admin
const DpHome = lazyWithRetry(() => import("./pages/dp/DpHome"));
const DpColaboradores = lazyWithRetry(() => import("./pages/dp/DpColaboradores"));
const DpColaboradoresLixeira = lazyWithRetry(() => import("./pages/dp/DpColaboradoresLixeira"));
const DpSolicitacoes = lazyWithRetry(() => import("./pages/dp/DpSolicitacoes"));
const DpDocumentos = lazyWithRetry(() => import("./pages/dp/DpDocumentos"));
const DpDocumentosHub = lazyWithRetry(() => import("./pages/dp/DpDocumentosHub"));
const DpDocumentosPorTipo = lazyWithRetry(() => import("./pages/dp/DpDocumentosPorTipo"));
const DpFolgas = lazyWithRetry(() => import("./pages/dp/DpFolgas"));
const DpFerias = lazyWithRetry(() => import("./pages/dp/DpFerias"));
const DpConformidade = lazyWithRetry(() => import("./pages/dp/DpConformidade"));
const DpBeneficios = lazyWithRetry(() => import("./pages/dp/DpBeneficios"));
const DpAnalytics = lazyWithRetry(() => import("./pages/dp/DpAnalytics"));

const DpFolgasHub = lazyWithRetry(() => import("./pages/dp/DpFolgasHub"));
const DpCadastrosHub = lazyWithRetry(() => import("./pages/dp/DpCadastrosHub"));
const DpCadastroPendencias = lazyWithRetry(() => import("./pages/dp/cadastros/DpCadastroPendencias"));

const DpConfiguracoesJornada = lazyWithRetry(() => import("./pages/dp/cadastros/DpConfiguracoesJornada"));
const DpConformidadeDsr = lazyWithRetry(() => import("./pages/dp/DpConformidadeDsr"));
const DpEscalas = lazyWithRetry(() => import("./pages/dp/DpEscalas"));
const DpEscalaMes = lazyWithRetry(() => import("./pages/dp/DpEscalaMes"));
const DpOperacaoDia = lazyWithRetry(() => import("./pages/dp/DpOperacaoDia"));
const DpConvocacoes = lazyWithRetry(() => import("./pages/dp/DpConvocacoes"));
const DpUnidades = lazyWithRetry(() => import("./pages/dp/DpUnidades"));
const DpCargos = lazyWithRetry(() => import("./pages/dp/DpCargos"));
const DpSindicatoNegociacoes = lazyWithRetry(() => import("./pages/dp/DpSindicatoNegociacoes"));
const DpAprovacoes = lazyWithRetry(() => import("./pages/dp/DpAprovacoes"));
const DpAvisos = lazyWithRetry(() => import("./pages/dp/DpAvisos"));
const DpMensagens = lazyWithRetry(() => import("./pages/dp/DpMensagens"));
const DpDisciplinar = lazyWithRetry(() => import("./pages/dp/DpDisciplinar"));
const DpBloqueios = lazyWithRetry(() => import("./pages/dp/DpBloqueios"));
const DpTrocas = lazyWithRetry(() => import("./pages/dp/DpTrocas"));
const DpConfiguracoes = lazyWithRetry(() => import("./pages/dp/DpConfiguracoes"));
const DpAdminCalendario = lazyWithRetry(() => import("./pages/dp/DpAdminCalendario"));
const DpModelosMensagem = lazyWithRetry(() => import("./pages/dp/DpModelosMensagem"));

const DpComunicacaoHub = lazyWithRetry(() => import("./pages/dp/DpComunicacaoHub"));
const DpAtestados = lazyWithRetry(() => import("./pages/dp/DpAtestados"));
const DpHistoricoCompleto = lazyWithRetry(() => import("./pages/dp/DpHistoricoCompleto"));
const DpNotificacoes = lazyWithRetry(() => import("./pages/dp/DpNotificacoes"));

// DP portal
const DpMeuHome = lazyWithRetry(() => import("./pages/dp/portal/DpMeuHome"));
const DpMeuMural = lazyWithRetry(() => import("./pages/dp/portal/DpMeuMural"));
const DpMeuPerfil = lazyWithRetry(() => import("./pages/dp/portal/DpMeuPerfil"));
const DpMeuDocumentos = lazyWithRetry(() => import("./pages/dp/portal/DpMeuDocumentos"));
const DpMeuSolicitacoes = lazyWithRetry(() => import("./pages/dp/portal/DpMeuSolicitacoes"));
const DpMeuTrocas = lazyWithRetry(() => import("./pages/dp/portal/DpMeuTrocas"));
const DpMeuCalendario = lazyWithRetry(() => import("./pages/dp/portal/DpMeuCalendario"));
const DpMeuEscala = lazyWithRetry(() => import("./pages/dp/portal/DpMeuEscala"));
const DpMinhasConvocacoes = lazyWithRetry(() => import("./pages/dp/portal/DpMinhasConvocacoes"));
const DpMeuHistorico = lazyWithRetry(() => import("./pages/dp/portal/DpMeuHistorico"));

// Admin
const AdminModulos = lazyWithRetry(() => import("./pages/admin/Modulos"));
const AdminTelasDesenvolvimento = lazyWithRetry(() => import("./pages/admin/TelasDesenvolvimento"));
const AdminEstatisticas = lazyWithRetry(() => import("./pages/admin/Estatisticas"));
const AdminClientes = lazyWithRetry(() => import("./pages/admin/Clientes"));
const AdminPlanosPage = lazyWithRetry(() => import("./pages/admin/Planos"));
const AdminAssinaturas = lazyWithRetry(() => import("./pages/admin/Assinaturas"));
const AdminFaturamento = lazyWithRetry(() => import("./pages/admin/Faturamento"));
const AdminCuponsPage = lazyWithRetry(() => import("./pages/admin/Cupons"));
const AdminFaturasPage = lazyWithRetry(() => import("./pages/admin/Faturas"));
const AdminWebhooksAsaasPage = lazyWithRetry(() => import("./pages/admin/WebhooksAsaas"));
const AdminPluggyWebhook = lazyWithRetry(() => import("./pages/admin/PluggyWebhook"));
const AdminPluggyStatus = lazyWithRetry(() => import("./pages/admin/PluggyStatus"));
const AdminPerfisAcesso = lazyWithRetry(() => import("./pages/admin/PerfisAcesso"));
const AdminAuditoria = lazyWithRetry(() => import("./pages/admin/Auditoria"));
const AdminResetarDados = lazyWithRetry(() => import("./pages/admin/ResetarDados"));
const AdminCadastros = lazyWithRetry(() => import("./pages/admin/Cadastros"));
const AdminCategoriasPadrao = lazyWithRetry(() => import("./pages/admin/CategoriasPadrao"));
const AdminContasContabeisPadrao = lazyWithRetry(() => import("./pages/admin/ContasContabeisPadrao"));
const AdminFormasPagamentoPadrao = lazyWithRetry(() => import("./pages/admin/FormasPagamentoPadrao"));
const AdminBancos = lazyWithRetry(() => import("./pages/admin/Bancos"));
const AdminDriftSaldos = lazyWithRetry(() => import("./pages/admin/DriftSaldos"));
const AdminSaudeSistema = lazyWithRetry(() => import("./pages/admin/SaudeSistema"));

const AdminSeoIndexacao = lazyWithRetry(() => import("./pages/admin/SeoIndexacao"));

const AdminDocumentosLegais = lazyWithRetry(() => import("./pages/admin/DocumentosLegais"));

// Público / auth-adjacente
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const Planos = lazyWithRetry(() => import("./pages/Planos"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout"));
const CheckoutPagamento = lazyWithRetry(() => import("./pages/CheckoutPagamento"));
const Faturas = lazyWithRetry(() => import("./pages/Faturas"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const LojaOnline = lazyWithRetry(() => import("./pages/storefront/LojaOnline"));

const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));
const Privacidade = lazyWithRetry(() => import("./pages/legal/Privacidade"));
const Termos = lazyWithRetry(() => import("./pages/legal/Termos"));
const CookiesPage = lazyWithRetry(() => import("./pages/legal/Cookies"));
const EncarregadoDados = lazyWithRetry(() => import("./pages/legal/EncarregadoDados"));
const DasMei = lazyWithRetry(() => import("./pages/guias/DasMei"));
const Buscar = lazyWithRetry(() => import("./pages/Buscar"));
const TrialExpired = lazyWithRetry(() => import("./pages/TrialExpired"));

// Site público (marketing)
const HomePage = lazyWithRetry(() => import("./pages/marketing/HomePage"));
const PlanosSitePage = lazyWithRetry(() => import("./pages/marketing/PlanosSitePage"));
const FinanceiroPage = lazyWithRetry(() => import("./pages/marketing/FinanceiroPage"));
const DpSitePage = lazyWithRetry(() => import("./pages/marketing/DpPage"));
const ContatoPage = lazyWithRetry(() => import("./pages/marketing/ContatoPage"));
const QuemSomosPage = lazyWithRetry(() => import("./pages/marketing/QuemSomosPage"));
const CasesPage = lazyWithRetry(() => import("./pages/marketing/CasesPage"));
const CaseDetailPage = lazyWithRetry(() => import("./pages/marketing/CaseDetailPage"));
const BlogPage = lazyWithRetry(() => import("./pages/marketing/BlogPage"));
const BlogPostPage = lazyWithRetry(() => import("./pages/marketing/BlogPostPage"));

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
  return <HomePage />;
}

/** /planos: site público para visitantes, planos da conta para usuários logados. */
function PlanosGate() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <PlanosSitePage />;
  return (
    <ProtectedRoute>
      <Planos />
    </ProtectedRoute>
  );
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
  <ErrorBoundary scope="rota">
    <Suspense fallback={<PageSpinner />}>
      <Routes>

      <Route path="/" element={<RootGate />} />
      <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
      <Route path="/login" element={<Navigate to="/auth" replace />} />
      <Route path="/dp/login" element={<Navigate to="/auth" replace />} />
      <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/dp/meu" element={<PortalProtected><ColaboradorShell /></PortalProtected>}>
        <Route index element={<DpMeuHome />} />
        <Route path="mural" element={<DpMeuMural />} />
        <Route path="perfil" element={<DpMeuPerfil />} />
        <Route path="cadastro" element={<Navigate to="/dp/meu/perfil" replace />} />
        <Route path="documentos" element={<DpMeuDocumentos />} />
        <Route path="solicitacoes" element={<DpMeuSolicitacoes />} />
        <Route path="trocas" element={<DpMeuTrocas />} />
        <Route path="calendario" element={<DpMeuCalendario />} />
        <Route path="escala" element={<DpMeuEscala />} />
        <Route path="convocacoes" element={<DpMinhasConvocacoes />} />
        <Route path="ponto" element={<Navigate to="/dp/meu" replace />} />
        <Route path="contracheque" element={<Navigate to="/dp/meu/documentos?tipo=contracheque" replace />} />


        <Route path="atestados" element={<Navigate to="/dp/meu/documentos?tipo=atestado" replace />} />
        <Route path="disciplinar" element={<Navigate to="/dp/meu/documentos?tipo=disciplinar" replace />} />
        <Route path="sindicato" element={<Navigate to="/dp/meu/documentos?tipo=act_cct" replace />} />
        <Route path="historico" element={<DpMeuHistorico />} />
        <Route path="mais" element={<Mais />} />
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
        <Route path="/relatorios/contabeis" element={<RelatoriosContabeis />} />
        <Route path="/relatorios/fluxo-caixa" element={<RelatorioFluxoCaixa />} />
        <Route path="/contatos" element={<Contatos />} />
        <Route path="/categorias" element={<Categorias />} />
        
        <Route path="/contas-contabeis" element={<ContasContabeis />} />
        <Route path="/contas-bancarias" element={<ContasBancarias />} />
        <Route path="/contas-bancarias/conciliacao" element={<ConciliacaoPluggy />} />
        <Route path="/contas-bancarias/conciliacao/extrato" element={<ExtratoConciliacao />} />
        <Route path="/contas-bancarias/conexoes" element={<ConexoesPluggy />} />
        <Route path="/cartoes-credito" element={<CartoesCredito />} />
        
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/gestao-usuarios" element={<GestaoUsuarios />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/formas-pagamento" element={<FormasPagamento />} />
        <Route path="/centros-custo" element={<CentrosCusto />} />
        <Route path="/crm" element={<ModuleGuard module="crm"><ModulePlaceholder module="crm" /></ModuleGuard>} />
        <Route path="/rh" element={<ModuleGuard module="rh"><ModulePlaceholder module="rh" /></ModuleGuard>} />
        <Route path="/pedidos" element={<PedidosModulo />} />
        <Route path="/pedidos/onboarding" element={<PedidosOnboarding />} />
        <Route path="/pedidos/assinatura" element={<PedidosAssinatura />} />
        <Route path="/pedidos/cardapio" element={<PedidosCardapio />} />
        <Route path="/pedidos/central" element={<PedidosCentral />} />
        <Route path="/pedidos/cozinha" element={<CozinhaCentral />} />
        <Route path="/pedidos/expedicao" element={<ExpedicaoCentral />} />
        <Route path="/pedidos/integracoes" element={<PedidosIntegracoes />} />
        <Route path="/pedidos/relatorios" element={<PedidosRelatorios />} />

        <Route path="/mais" element={<Mais />} />
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
        <Route path="colaboradores/lixeira" element={<DpColaboradoresLixeira />} />
        <Route path="solicitacoes" element={<DpSolicitacoes />} />
        <Route path="folgas" element={<DpFolgasHub />} />
        <Route path="folgas/calendario" element={<DpFolgas />} />
        <Route path="ferias" element={<DpFerias />} />
        <Route path="conformidade" element={<ModuloEmDesenvolvimentoGate titulo="SESMT"><DpConformidade /></ModuloEmDesenvolvimentoGate>} />
        <Route path="beneficios" element={<Navigate to="/dp/cadastros/beneficios" replace />} />
        <Route path="analytics" element={<DpAnalytics />} />

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
        <Route path="documentos/importar" element={<Navigate to="/dp/documentos" replace />} />
        <Route path="cadastros" element={<DpCadastrosHub />} />
        <Route path="cadastros/unidades" element={<DpUnidades />} />
        <Route path="cadastros/cargos" element={<DpCargos />} />
        <Route path="cadastros/adicionais" element={<Navigate to="/dp/cadastros/cargos?aba=complementos" replace />} />
        <Route path="cadastros/documentos-exigidos" element={<Navigate to="/dp/cadastros/cargos?aba=documentos" replace />} />
        <Route path="cadastros/sindicatos" element={<Navigate to="/dp/cadastros/unidades" replace />} />
        <Route path="cadastros/pendencias" element={<DpCadastroPendencias />} />
        <Route path="cadastros/beneficios" element={<DpBeneficios />} />
        <Route path="cadastros/turnos" element={<Navigate to="/dp/cadastros/cargos?aba=turnos" replace />} />
        <Route path="turnos" element={<Navigate to="/dp/cadastros/cargos?aba=turnos" replace />} />
        <Route path="folgas/configuracoes/regras" element={<DpConfiguracoesJornada />} />
        <Route path="cadastros/regras-jornada" element={<Navigate to="/dp/folgas/configuracoes/regras" replace />} />
        <Route path="conformidade-dsr" element={<DpConformidadeDsr />} />
        <Route path="escalas" element={<DpEscalas />} />
        <Route path="escalas/mes" element={<DpEscalaMes />} />
        <Route path="operacao" element={<DpOperacaoDia />} />
        <Route path="convocacoes" element={<DpConvocacoes />} />
        {/* Folha de pagamento e ponto desativados: gerados fora do sistema por ora. */}
        <Route path="ponto" element={<Navigate to="/dp" replace />} />
        <Route path="ponto/time" element={<Navigate to="/dp" replace />} />
        <Route path="ponto/apuracao" element={<Navigate to="/dp" replace />} />
        <Route path="folha" element={<Navigate to="/dp" replace />} />
        <Route path="folha/provisoes" element={<Navigate to="/dp" replace />} />
        <Route path="folha/relatorios" element={<Navigate to="/dp" replace />} />
        <Route path="rescisoes" element={<Navigate to="/dp" replace />} />
        <Route path="folha/:id" element={<Navigate to="/dp" replace />} />


        <Route path="documentos/act-cct" element={<DpSindicatoNegociacoes />} />
        <Route path="configuracoes" element={<DpConfiguracoes />} />
        <Route path="sindicatos" element={<Navigate to="/dp/cadastros/unidades" replace />} />
        <Route path="unidades" element={<Navigate to="/dp/cadastros/unidades" replace />} />
        <Route path="cargos" element={<Navigate to="/dp/cadastros/cargos" replace />} />
        <Route path="sindicatos/negociacoes" element={<Navigate to="/dp/documentos/act-cct" replace />} />
        <Route path="cadastros/sindicatos/negociacoes" element={<Navigate to="/dp/documentos/act-cct" replace />} />
        <Route path="documentos/sindicato" element={<Navigate to="/dp/documentos/act-cct" replace />} />
        <Route path="comunicacao/avisos" element={<Navigate to="/dp/avisos" replace />} />
        <Route path="comunicacao/mensagens" element={<Navigate to="/dp/mensagens" replace />} />
        <Route path="mais" element={<Mais />} />
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
        <Route path="/admin/cadastros" element={<AdminCadastros />} />
        <Route path="/admin/categorias-padrao" element={<AdminCategoriasPadrao />} />
        <Route path="/admin/contas-contabeis-padrao" element={<AdminContasContabeisPadrao />} />
        <Route path="/admin/formas-pagamento-padrao" element={<AdminFormasPagamentoPadrao />} />
        <Route path="/admin/planos" element={<AdminPlanosPage />} />
        <Route path="/admin/assinaturas" element={<AdminAssinaturas />} />
        <Route path="/admin/faturamento" element={<AdminFaturamento />} />
        <Route path="/admin/cupons" element={<AdminCuponsPage />} />
        <Route path="/admin/faturas" element={<AdminFaturasPage />} />
        <Route path="/admin/webhooks-asaas" element={<AdminWebhooksAsaasPage />} />
        <Route path="/admin/pluggy-webhook" element={<AdminPluggyWebhook />} />
        <Route path="/admin/pluggy-status" element={<AdminPluggyStatus />} />
        <Route path="/admin/perfis-acesso" element={<AdminPerfisAcesso />} />
        <Route path="/admin/auditoria" element={<AdminAuditoria />} />
        <Route path="/admin/resetar-dados" element={<AdminResetarDados />} />
        <Route path="/admin/documentos-legais" element={<AdminDocumentosLegais />} />
        <Route path="/admin/bancos" element={<AdminBancos />} />
        <Route path="/admin/auditoria-saldos" element={<AdminDriftSaldos />} />
        <Route path="/admin/saude-sistema" element={<AdminSaudeSistema />} />

        
        <Route path="/admin/seo-indexacao" element={<AdminSeoIndexacao />} />
        <Route path="/admin/modulos" element={<AdminModulos />} />
        <Route path="/admin/telas" element={<AdminTelasDesenvolvimento />} />
        <Route path="/admin/categorizacao-ia" element={<CategorizacaoIA />} />
        <Route path="/admin/mais" element={<Mais />} />

      </Route>
      <Route path="/c/:slug" element={<LojaOnline />} />
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
      <Route path="/planos" element={<PlanosGate />} />
      <Route path="/financeiro" element={<FinanceiroPage />} />
      <Route path="/departamento-pessoal" element={<DpSitePage />} />
      <Route path="/contato" element={<ContatoPage />} />
      <Route path="/quem-somos" element={<QuemSomosPage />} />
      <Route path="/cases" element={<CasesPage />} />
      <Route path="/cases/:slug" element={<CaseDetailPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/checkout/:planSlug" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
      <Route path="/checkout/pagamento/:invoiceId" element={<ProtectedRoute><CheckoutPagamento /></ProtectedRoute>} />
      <Route path="/faturas" element={<ProtectedRoute><Faturas /></ProtectedRoute>} />
      <Route path="/trial-expirado" element={<ProtectedRoute><TrialExpired /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </ErrorBoundary>
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
  <ErrorBoundary scope="app" title="Falha ao iniciar o 360°FOOD">
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
  </ErrorBoundary>

);

export default App;
