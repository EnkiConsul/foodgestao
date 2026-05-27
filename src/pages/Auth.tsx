import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { MfaEnrollRequired } from "@/components/auth/MfaEnrollRequired";

import { z } from "zod";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(100),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type Mode = "login" | "signup" | "forgot";

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("weak") || m.includes("pwned") || m.includes("known to be")) {
    return "Senha comprometida ou muito fraca. Escolha outra com no mínimo 6 caracteres, combinando letras maiúsculas, minúsculas, números e símbolos.";
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

export default function Auth() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaEnrollRequired, setMfaEnrollRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const checkMfaState = async () => {
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const hasVerified = (factors?.totp ?? []).some((f) => f.status === "verified");
    const needsAal2 = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
    return { hasVerified, needsAal2 };
  };

  const mfaCheckedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      mfaCheckedForUser.current = null;
      setMfaRequired(false);
      setMfaEnrollRequired(false);
      return;
    }
    if (mfaCheckedForUser.current === user.id) return;
    mfaCheckedForUser.current = user.id;
    checkMfaState().then(({ hasVerified, needsAal2 }) => {
      if (!hasVerified) {
        setMfaEnrollRequired(true);
      } else if (needsAal2) {
        setMfaRequired(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isLogin = mode === "login";
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const getRedirectTarget = () => {
    const r = searchParams.get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) return r;
    return "/";
  };

  const checkMfaAndRedirect = async () => {
    const target = getRedirectTarget();
    const { hasVerified, needsAal2 } = await checkMfaState();
    if (!hasVerified) {
      setMfaEnrollRequired(true);
      return;
    }
    if (needsAal2) {
      setMfaRequired(true);
    } else {
      navigate(target, { replace: true });
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
      ? loginSchema.safeParse({ email, password })
      : signupSchema.safeParse({ email, password, confirmPassword, fullName });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error("Erro ao entrar", { description: error.message });
        } else {
          await checkMfaAndRedirect();
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast.error("Erro ao cadastrar", { description: translateAuthError(error.message) });
        } else {
          toast.success("Cadastro realizado!");
          navigate("/onboarding");
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
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <CardTitle className="text-2xl font-bold">Gestor Plin</CardTitle>
          <CardDescription>
            {mfaEnrollRequired
              ? "Configure a autenticação em 2 fatores"
              : mfaRequired
              ? "Verificação em duas etapas"
              : isForgot
              ? "Recuperar senha"
              : isLogin
              ? "Entre na sua conta"
              : "Crie sua conta gratuita"}
          </CardDescription>
        </CardHeader>

        {mfaEnrollRequired ? (
          <CardContent>
            <MfaEnrollRequired
              onSuccess={() => navigate(getRedirectTarget(), { replace: true })}
            />
          </CardContent>
        ) : mfaRequired ? (
          <CardContent>
            <MfaChallenge
              onSuccess={() => navigate(getRedirectTarget(), { replace: true })}
              onCancel={() => setMfaRequired(false)}
            />
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
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

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  maxLength={255}
                />
              </div>
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            {!isForgot && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {isLogin && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => switchMode("forgot")}
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

            {isForgot && (
              <p className="text-xs text-muted-foreground">
                Informe o e-mail da sua conta. Enviaremos um link para você redefinir sua senha.
              </p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={submitting}>
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
          </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
