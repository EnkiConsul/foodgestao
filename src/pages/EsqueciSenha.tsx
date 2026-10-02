import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, IdCard, ShieldCheck, MessageCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { useTurnstileConfig } from "@/hooks/useTurnstileSiteKey";
import { describeTurnstileError, currentHostname } from "@/lib/auth/turnstileErrors";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { avaliarSenha, SENHA_MIN } from "@/lib/security/passwordPolicy";
import { MedidorSenha } from "@/components/auth/MedidorSenha";

type Step = "identify" | "otp" | "password" | "done";

export default function EsqueciSenha() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const primeiro = searchParams.get("primeiro") === "1";
  const [aviso, setAviso] = useState<string | null>(null);
  const [telefoneMascarado, setTelefoneMascarado] = useState<string | null>(null);
  const { siteKey, mode: turnstileMode } = useTurnstileConfig();

  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // OTP state
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Resend control
  const RESEND_COOLDOWN = 60;
  const MAX_RESENDS = 3;
  const [resendIn, setResendIn] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);

  // Password reset state
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // OTP expiration countdown
  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  // Resend cooldown countdown
  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, resendIn]);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileToken) {
      toast.error("Aguarde a verificação de segurança.");
      return;
    }
    const raw = identifier.trim();
    setAviso(null);
    if (primeiro) {
      if (raw.replace(/\D/g, "").length !== 11) {
        setAviso("Digite os 11 números do seu CPF.");
        return;
      }
      setSubmitting(true);
      try {
        const { data, error } = await supabase.functions.invoke("auth-primeiro-acesso-cpf", {
          body: { cpf: raw, turnstile_token: turnstileToken },
        });
        if (error) {
          let msg = "Não foi possível enviar o código agora. Tente novamente.";
          try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* ignora */ }
          setAviso(msg);
          return;
        }
        const mensagens: Record<string, string> = {
          cpf_invalido: "Digite os 11 números do seu CPF.",
          cpf_nao_encontrado:
            "Não localizamos nenhum cadastro ativo com este CPF. Confira se os 11 números foram digitados corretamente ou procure o gestor/RH da sua empresa para confirmar seu cadastro.",
          sem_whatsapp:
            "Seu cadastro foi localizado, mas ainda não possui um número de WhatsApp cadastrado para envio do código de segurança. Solicite ao gestor ou RH da sua empresa a inclusão do seu celular com DDD.",
          ja_possui_senha:
            "Você já criou sua senha. Volte à tela de login e entre com seu CPF e senha. Se não lembrar, use \"Esqueci minha senha\".",
          acesso_indisponivel:
            "O acesso ao portal não está disponível para este cadastro. Procure o gestor ou RH da sua empresa.",
          falha_envio:
            "Não conseguimos enviar o código pelo WhatsApp agora. Tente novamente em alguns minutos ou procure o gestor/RH.",
        };
        if (data?.status !== "enviado") {
          setAviso(mensagens[data?.status] ?? "Não foi possível enviar o código agora.");
          return;
        }
        setChallengeId(data.challenge_id);
        setChallengeToken(data.challenge_token);
        setTelefoneMascarado(data.telefone_mascarado ?? null);
        setSecondsLeft(data.expires_in ?? 600);
        setResendIn(RESEND_COOLDOWN);
        setStep("otp");
      } finally {
        setTurnstileToken(null);
        setTurnstileNonce((nonce) => nonce + 1);
        setSubmitting(false);
      }
      return;
    }
    if (raw.length < 3) {
      toast.error("Informe seu e-mail ou CPF.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-recovery-request", {
        body: { identifier: raw, turnstile_token: turnstileToken },
      });
      if (error) throw error;
      if (!data?.challenge_id || !data?.challenge_token) {
        toast.error("Não foi possível iniciar a recuperação.");
        return;
      }
      setChallengeId(data.challenge_id);
      setChallengeToken(data.challenge_token);
      setSecondsLeft(data.expires_in ?? 600);
      setResendIn(RESEND_COOLDOWN);
      setStep("otp");
    } catch (err: any) {
      const msg = err?.context?.error ?? err?.message ?? "Falha ao enviar código.";
      toast.error(msg);
    } finally {
      // Turnstile tokens are single-use, including requests that return an error.
      setTurnstileToken(null);
      setTurnstileNonce((nonce) => nonce + 1);
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId || !challengeToken) return;
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Digite o código de 6 dígitos.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-recovery-verify", {
        body: { challenge_id: challengeId, challenge_token: challengeToken, otp },
      });
      if (error) throw error;
      if (!data?.reset_token) {
        toast.error("Código inválido.");
        return;
      }
      setResetToken(data.reset_token);
      setStep("password");
    } catch (err: any) {
      const msg = err?.context?.error ?? err?.message ?? "Código inválido ou expirado.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId || !resetToken) return;
    const av = avaliarSenha(newPassword);
    if (!av.valida) {
      toast.error(av.mensagem as string);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-recovery-reset", {
        body: { challenge_id: challengeId, reset_token: resetToken, new_password: newPassword },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error("Não foi possível redefinir a senha.");
        return;
      }
      setStep("done");
      toast.success("Senha redefinida com sucesso!");
    } catch (err: any) {
      const msg = err?.context?.error ?? err?.message ?? "Falha ao redefinir senha.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Helmet>
        <title>{primeiro ? "Primeiro acesso" : "Recuperar senha"} — Aveto 360</title>
        <meta name="description" content="Recupere o acesso à sua conta Aveto 360 com verificação via WhatsApp." />
      </Helmet>

      <div className="w-full max-w-md space-y-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao site
        </Link>
        <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">{primeiro ? "Primeiro Acesso" : "Recuperar senha"}</CardTitle>
          <CardDescription>
            {step === "identify" && (primeiro
              ? "Digite seu CPF. Enviaremos um código de segurança para o WhatsApp da sua ficha."
              : "Informe seu e-mail ou CPF. Enviaremos um código pelo WhatsApp cadastrado.")}
            {step === "otp" && (telefoneMascarado
              ? `Enviamos um código de 6 dígitos para o WhatsApp com final ${telefoneMascarado}. Digite o código abaixo para criar sua senha.`
              : "Digite o código de 6 dígitos enviado para o WhatsApp cadastrado.")}
            {step === "password" && "Escolha uma nova senha forte para continuar."}
            {step === "done" && "Tudo pronto! Você já pode entrar com sua nova senha."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "identify" && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">{primeiro ? "CPF" : "E-mail ou CPF"}</Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="identifier"
                    name="username"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={primeiro ? "Apenas números" : "seu@email.com ou 000.000.000-00"}
                    inputMode={primeiro ? "numeric" : undefined}
                    className="pl-10"
                    maxLength={255}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {aviso && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">{aviso}</AlertDescription>
                </Alert>
              )}
              {!primeiro && <Alert>
                <MessageCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Por segurança, não informamos se o cadastro existe. Se estiver correto, você receberá o código no
                  WhatsApp cadastrado.
                </AlertDescription>
              </Alert>}

              {siteKey && (
                <TurnstileWidget
                  key={turnstileNonce}
                  siteKey={siteKey}
                  onToken={(t) => { setTurnstileToken(t); setTurnstileError(null); }}
                  onExpire={() => setTurnstileToken(null)}
                  onError={(code) => { setTurnstileToken(null); setTurnstileError(code); }}
                  hidden={!!turnstileError}
                />
              )}
              {turnstileMode === "test" && !turnstileError && (
                <p className="text-xs text-muted-foreground">
                  Verificação em modo de teste (ambiente de preview).
                </p>
              )}
              {turnstileError && (() => {
                const info = describeTurnstileError(turnstileError, currentHostname());
                return (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs space-y-1">
                      <p className="font-medium">{info.title}</p>
                      <p>{info.message}</p>
                      {info.hint && <p>{info.hint}</p>}
                    </AlertDescription>
                  </Alert>
                );
              })()}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !turnstileToken || !!turnstileError}
              >
                {submitting ? "Enviando..." : "Enviar código"}
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Código de 6 dígitos</Label>
                <Input
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground text-center">
                  {secondsLeft > 0 ? `Expira em ${mmss}` : "Código expirado. Solicite novamente."}
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={submitting || secondsLeft === 0 || otp.length !== 6}>
                {submitting ? "Verificando..." : "Verificar código"}
              </Button>

              {resendAttempts < MAX_RESENDS ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={resendIn > 0}
                  onClick={() => {
                    setResendAttempts((n) => n + 1);
                    setOtp("");
                    setChallengeId(null);
                    setChallengeToken(null);
                    setTurnstileToken(null);
                    setSecondsLeft(0);
                    setResendIn(0);
                    setStep("identify");
                    toast.info("Complete a verificação de segurança para reenviar o código.");
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {resendIn > 0
                    ? `Reenviar em ${resendIn}s`
                    : `Reenviar código (${MAX_RESENDS - resendAttempts} restantes)`}
                </Button>
              ) : (
                <p className="text-xs text-center text-muted-foreground">
                  Limite de reenvios atingido. Tente novamente em alguns minutos.
                </p>
              )}
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-pw">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-pw"
                    name="password"
                    autoComplete="new-password"
                    type={showPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    minLength={12}
                    maxLength={72}
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    tabIndex={-1}
                    aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <MedidorSenha senha={newPassword} semMensagem />
                <ChecklistRequisitosSenha senha={newPassword} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pw">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-pw"
                    name="confirmPassword"
                    autoComplete="new-password"
                    type={showPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    maxLength={128}
                    required
                  />
                </div>
                <ConferenciaSenhas senha={newPassword} confirmacao={confirmPassword} />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !avaliarSenha(newPassword).valida || newPassword !== confirmPassword}
              >
                {submitting ? "Salvando..." : "Salvar senha"}
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Sua senha foi atualizada. Faça login com suas novas credenciais.
              </p>
              <Button className="w-full" onClick={() => navigate("/auth")}>
                Ir para o login
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <Link to="/auth" className="text-xs text-muted-foreground hover:text-foreground">
            Voltar ao login
          </Link>
        </CardFooter>
        </Card>
      </div>
    </div>
  );
}
