import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, MailCheck, Lock, User, Eye, EyeOff, IdCard } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { useTurnstileSiteKey } from "@/hooks/useTurnstileSiteKey";
import { describeTurnstileError, currentHostname } from "@/lib/auth/turnstileErrors";
import { unifiedSignIn } from "@/lib/authUnified";
import { sanitizeRedirect } from "@/lib/safeRedirect";

import { z } from "zod";
import { toast } from "sonner";
import { trackEvent, FunnelStep } from "@/lib/analytics";
import logoMarinho from "@/assets/aveto360-logo.png.asset.json";

// Login identifier: e-mail OR CPF (11 digits with or without punctuation)
const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Informe seu e-mail ou CPF").max(255).refine((v) => {
    if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    return /^\d{11}$/.test(v.replace(/\D/g, ""));
  }, { message: "Informe um e-mail válido ou um CPF com 11 dígitos" }),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
});

const signupSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
  fullName: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(100),
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Você precisa aceitar os Termos e a Política de Privacidade" }),
  }),
}).refine((d) => d.password === d.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type Mode = "login" | "signup" | "forgot" | "confirm-email";

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("weak") || m.includes("pwned") || m.includes("known to be")) {
    return "Senha comprometida ou muito fraca. Escolha outra com no mínimo 6 caracteres, combinando letras maiúsculas, minúsculas, números e símbolos.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Seu e-mail ainda não foi confirmado. Abra o link que enviamos para a sua caixa de entrada e confirme o cadastro.";
  }
  if (m.includes("already registered") || m.includes("user already")) {
    return "Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.";
  }
  if (m.includes("password should be at least")) {
    return "A senha deve ter no mínimo 6 caracteres.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "E-mail inválido.";
  }
  return message;
}

/** Categorize a signup error into a small, stable set of reasons for GA4 reporting. */
function classifySignupError(message: string): { reason: string; category: "validation" | "api" | "network" | "rate_limit" | "unknown" } {
  const m = (message || "").toLowerCase();
  if (m.includes("already registered") || m.includes("user already")) return { reason: "email_already_registered", category: "validation" };
  if (m.includes("weak") || m.includes("pwned") || m.includes("known to be") || m.includes("password should be at least")) return { reason: "weak_password", category: "validation" };
  if (m.includes("invalid") && m.includes("email")) return { reason: "invalid_email", category: "validation" };
  if (m.includes("rate") && m.includes("limit")) return { reason: "rate_limit", category: "rate_limit" };
  if (m.includes("captcha")) return { reason: "captcha_failed", category: "validation" };
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("fetch failed") || m.includes("timeout")) return { reason: "network_error", category: "network" };
  if (m.includes("500") || m.includes("server")) return { reason: "server_error", category: "api" };
  return { reason: "unknown_api_error", category: "api" };
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode: Mode = searchParams.get("tab") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [duplicateEmail, setDuplicateEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const turnstileSiteKey = useTurnstileSiteKey();
  const { signUp, user } = useAuth();
  const navigate = useNavigate();

  const checkMfaState = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsAal2 = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
    return { needsAal2 };
  };

  const mfaCheckedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      mfaCheckedForUser.current = null;
      setMfaRequired(false);
      return;
    }
    if (mfaCheckedForUser.current === user.id) return;
    mfaCheckedForUser.current = user.id;
    checkMfaState().then(({ needsAal2 }) => {
      if (needsAal2) setMfaRequired(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isLogin = mode === "login";
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isConfirmEmail = mode === "confirm-email";

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResendConfirmation = async () => {
    if (!pendingConfirmationEmail || resendCooldown > 0) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingConfirmationEmail,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        toast.error("Não foi possível reenviar", { description: translateAuthError(error.message) });
      } else {
        toast.success("E-mail reenviado", { description: "Confira sua caixa de entrada e a pasta de spam." });
        setResendCooldown(60);
      }
    } finally {
      setResending(false);
    }
  };

  // Track signup form view (funnel step between CTA click and signup_start)
  const signupViewTracked = useRef(false);
  useEffect(() => {
    if (isSignup && !signupViewTracked.current) {
      signupViewTracked.current = true;
      trackEvent(FunnelStep.SignupFormView, {
        referrer: document.referrer || "direct",
      });
    }
    if (!isSignup) signupViewTracked.current = false;
  }, [isSignup]);

  // Só caminhos internos são aceitos; qualquer URL externa cai em /hub.
  const getRedirectTarget = () => sanitizeRedirect(searchParams.get("redirect"));

  const goTo = (rawTarget: string) => {
    const target = sanitizeRedirect(rawTarget);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === target) return;
    navigate(target, { replace: true });
    // Fallback: se por algum motivo a navegação do router não ocorrer
    // (gate em suspense, corrida com a hidratação da sessão), força a
    // navegação do browser. Vale tanto para login em "/" quanto em "/auth".
    window.setTimeout(() => {
      if (window.location.pathname !== target.split(/[?#]/)[0]) {
        window.location.replace(target);
      }
    }, 800);
  };

  const checkMfaAndRedirect = async () => {
    const target = getRedirectTarget();
    const { needsAal2 } = await checkMfaState();
    if (needsAal2) {
      setMfaRequired(true);
    } else {
      goTo(target);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (isForgot) {
      const emailParsed = z.string().trim().email("E-mail inválido").max(255).safeParse(email);
      if (!emailParsed.success) {
        setErrors({ email: emailParsed.error.errors[0].message });
        return;
      }
      setSubmitting(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(emailParsed.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          toast.error("Erro ao enviar", { description: error.message });
        } else {
          toast.success("E-mail enviado", {
            description: "Se a conta existir, você receberá um link para redefinir a senha.",
          });
          setMode("login");
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsed = isLogin
      ? loginSchema.safeParse({ identifier, password })
      : signupSchema.safeParse({ email, password, confirmPassword, fullName, acceptTerms: acceptTerms as true });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      if (isSignup) {
        trackEvent(FunnelStep.SignupValidationError, {
          method: "email",
          error_category: "validation",
          reason: "client_validation",
          error_fields: Object.keys(fieldErrors).join(","),
          error_count: Object.keys(fieldErrors).length,
        });
      }
      return;
    }

    if (isSignup) {
      trackEvent(FunnelStep.SignupStart, { method: "email" });
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        if (turnstileError) {
          toast.error("Verificação de segurança indisponível", {
            description: "Não foi possível carregar o CAPTCHA neste domínio. Acesse pelo site oficial ou avise o administrador.",
          });
          setSubmitting(false);
          return;
        }
        if (!turnstileToken) {
          toast.error("Verificação de segurança", { description: "Aguarde ou complete o desafio antes de entrar." });
          setSubmitting(false);
          return;
        }
        const result = await unifiedSignIn(identifier, password, turnstileToken);
        if (!result.ok) {
          toast.error("Erro ao entrar", {
            description: result.errorMessage ? translateAuthError(result.errorMessage) : undefined,
          });
          setTurnstileToken(""); // force re-solve
          if (typeof window !== "undefined" && window.turnstile) {
            try { window.turnstile.reset(); } catch { /* noop */ }
          }
        } else if (result.passwordChangeRequired) {
          navigate("/primeiro-acesso", { replace: true });
        } else {
          await checkMfaAndRedirect();
        }
      } else {
        try {
          const { error, needsEmailConfirmation, alreadyRegistered } = await signUp(email, password, fullName);
          if (error) {
            const translated = translateAuthError(error.message);
            const { reason, category } = classifySignupError(error.message);
            toast.error("Erro ao cadastrar", { description: translated });
            trackEvent(FunnelStep.SignupError, {
              method: "email",
              reason,
              error_category: category,
              error_message: error.message?.slice(0, 200) ?? "unknown",
            });
          } else if (alreadyRegistered) {
            setDuplicateEmail(email.trim());
            setPassword("");
            setConfirmPassword("");
            toast.error("E-mail já cadastrado", {
              description: "Entre com sua senha ou use \"Esqueci minha senha\".",
            });
            trackEvent(FunnelStep.SignupError, {
              method: "email",
              reason: "email_already_registered",
              error_category: "validation",
              error_message: "signup_without_identities",
            });
          } else {
            // Log LGPD acceptance (best-effort, non-blocking)
            try {
              const { data: { user: newUser } } = await supabase.auth.getUser();
              if (newUser) {
                await supabase.from("legal_acceptances").insert([
                  { user_id: newUser.id, document_type: "terms", document_version: "1.0", user_agent: navigator.userAgent },
                  { user_id: newUser.id, document_type: "privacy", document_version: "1.0", user_agent: navigator.userAgent },
                ]);
              }
            } catch (e) {
              console.warn("Failed to log legal acceptance", e);
            }
            // GA4 recommended event + qualified lead conversion
            trackEvent(FunnelStep.SignupSuccess, { method: "email" });
            trackEvent(FunnelStep.LeadGenerated, {
              currency: "BRL",
              value: 0,
              method: "email_signup",
            });
            if (needsEmailConfirmation) {
              setPendingConfirmationEmail(email.trim());
              setPassword("");
              setConfirmPassword("");
              setResendCooldown(60);
              setMode("confirm-email");
              toast.success("Cadastro realizado!", {
                description: "Confirme seu e-mail para ativar o acesso.",
              });
            } else {
              toast.success("Cadastro realizado!");
              navigate("/onboarding");
            }
          }
        } catch (thrown) {
          const msg = thrown instanceof Error ? thrown.message : String(thrown);
          const { reason, category } = classifySignupError(msg);
          toast.error("Erro ao cadastrar", { description: "Falha de conexão. Tente novamente." });
          trackEvent(FunnelStep.SignupError, {
            method: "email",
            reason,
            error_category: category,
            error_message: msg.slice(0, 200),
            thrown: true,
          });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setPassword("");
    setConfirmPassword("");
    setTurnstileError(null);
    setTurnstileToken("");
    setDuplicateEmail("");
  };

  const goToLoginWithDuplicate = () => {
    const target = duplicateEmail;
    switchMode("login");
    setIdentifier(target);
  };

  const goToForgotWithDuplicate = () => {
    const target = duplicateEmail;
    switchMode("forgot");
    setEmail(target);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Helmet>
        <title>Entrar ou criar conta — Aveto 360</title>
        <meta name="description" content="Acesse sua conta Aveto 360 ou crie um cadastro gratuito para gerenciar suas finanças pessoais e empresariais." />
        <meta property="og:title" content="Entrar ou criar conta — Aveto 360" />
        <meta property="og:description" content="Acesse sua conta Aveto 360 ou crie um cadastro gratuito para gerenciar suas finanças." />
      </Helmet>
      <h1 className="sr-only">Acesse sua conta ou crie seu cadastro no Aveto 360</h1>
      <div className="w-full max-w-md space-y-3">
        <Card className="w-full shadow-lg">

        <CardHeader className="text-center space-y-3">
          <CardTitle className="sr-only">Aveto 360</CardTitle>
          <img
            src={logoMarinho.url}
            alt="Aveto 360"
            className="mx-auto h-16 w-auto select-none"
            draggable={false}
          />
          <CardDescription>
            {mfaRequired
              ? "Verificação em duas etapas"
              : isConfirmEmail
              ? "Confirme seu e-mail"
              : isForgot
              ? "Recuperar senha"
              : isLogin
              ? "Entre na sua conta"
              : "Crie sua conta gratuita"}
          </CardDescription>
        </CardHeader>

        {mfaRequired ? (
          <CardContent>
            <MfaChallenge
              onSuccess={() => goTo(getRedirectTarget())}
              onCancel={() => setMfaRequired(false)}
            />
          </CardContent>
        ) : isConfirmEmail ? (
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <MailCheck className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Confirme seu e-mail</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para{" "}
                <span className="font-medium text-foreground break-all">{pendingConfirmationEmail}</span>.
                Abra sua caixa de entrada e clique no link para ativar seu acesso.
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Não encontrou? Verifique a pasta de spam ou lixo eletrônico. O link é válido por tempo limitado.
            </div>
            <div className="space-y-2">
              <Button
                type="button"
                className="w-full"
                onClick={handleResendConfirmation}
                disabled={resending || resendCooldown > 0}
              >
                {resending
                  ? "Reenviando..."
                  : resendCooldown > 0
                  ? `Reenviar em ${resendCooldown}s`
                  : "Reenviar e-mail de confirmação"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => switchMode("login")}>
                Voltar ao login
              </Button>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {isSignup && duplicateEmail && (
              <div
                role="alert"
                className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"
              >
                <p className="text-sm text-foreground">
                  Este e-mail já está cadastrado:{" "}
                  <span className="font-medium break-all">{duplicateEmail}</span>. Entre com sua senha
                  ou use “Esqueci minha senha”.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" size="sm" className="sm:flex-1" onClick={goToLoginWithDuplicate}>
                    Entrar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="sm:flex-1"
                    onClick={goToForgotWithDuplicate}
                  >
                    Recuperar senha
                  </Button>
                </div>
              </div>
            )}
            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    placeholder="Seu nome"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                    maxLength={100}
                  />
                </div>
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
              </div>
            )}

            {isLogin ? (
              <div className="space-y-2">
                <Label htmlFor="identifier">E-mail ou CPF</Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="seu@email.com ou 000.000.000-00"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="pl-10"
                    maxLength={255}
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
                {errors.identifier && <p className="text-xs text-destructive">{errors.identifier}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setDuplicateEmail(""); }}
                    className="pl-10"
                    maxLength={255}
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
            )}

            {!isForgot && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {isLogin && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => navigate("/esqueci-senha")}
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
            )}

            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
              </div>
            )}

            {isSignup && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="acceptTerms"
                    checked={acceptTerms}
                    onCheckedChange={(c) => setAcceptTerms(c === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="acceptTerms" className="text-xs font-normal leading-relaxed cursor-pointer">
                    Li e aceito os{" "}
                    <Link to="/termos" target="_blank" className="text-primary underline hover:no-underline">
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link to="/privacidade" target="_blank" className="text-primary underline hover:no-underline">
                      Política de Privacidade
                    </Link>
                    .
                  </Label>
                </div>
                {errors.acceptTerms && <p className="text-xs text-destructive">{errors.acceptTerms}</p>}
              </div>
            )}

            {isForgot && (
              <p className="text-xs text-muted-foreground">
                Informe o e-mail da sua conta. Enviaremos um link para você redefinir sua senha.
              </p>
            )}

            {isLogin && turnstileSiteKey && (
              <div className="pt-1 space-y-2">
                <TurnstileWidget
                  key={turnstileNonce}
                  siteKey={turnstileSiteKey}
                  hidden={!!turnstileError}
                  onToken={(t) => { setTurnstileToken(t); setTurnstileError(null); }}
                  onExpire={() => setTurnstileToken("")}
                  onError={(code) => { setTurnstileToken(""); setTurnstileError(code); }}
                />
                {turnstileError && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2"
                  >
                    <p className="font-medium">{describeTurnstileError(turnstileError, currentHostname()).title}</p>
                    <p className="text-destructive/90">{describeTurnstileError(turnstileError, currentHostname()).message}</p>
                    {describeTurnstileError(turnstileError, currentHostname()).hint && (
                      <p className="text-destructive/90">{describeTurnstileError(turnstileError, currentHostname()).hint}</p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTurnstileError(null);
                        setTurnstileToken("");
                        setTurnstileNonce((n) => n + 1);
                      }}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={submitting || (isLogin && !!turnstileError)}>

              {submitting
                ? "Aguarde..."
                : isForgot
                ? "Enviar link de recuperação"
                : isLogin
                ? "Entrar"
                : "Criar conta"}
            </Button>
            {isForgot ? (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => switchMode("login")}
              >
                Voltar para o login
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => switchMode(isLogin ? "signup" : "login")}
              >
                {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entre"}
              </button>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Colaboradores podem entrar com CPF neste mesmo formulário.
            </p>
          </CardFooter>
          </form>
        )}
        </Card>
      </div>
    </div>
  );
}
