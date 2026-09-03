import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, ShieldCheck, Copy, AlertCircle, CheckCircle2, Smartphone, QrCode, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { TotpCountdown } from "./TotpCountdown";

interface Props {
  onSuccess: () => void;
}

interface EnrollData {
  factorId: string;
  qrSvg: string;
  secret: string;
}

type Stage = "loading" | "setup" | "confirmed" | "error";

function translateMfaError(message: string | undefined): string {
  if (!message) return "Não foi possível validar o código. Tente novamente.";
  const m = message.toLowerCase();
  if (m.includes("friendly name") && m.includes("already exists")) {
    return "Já existe uma configuração de 2FA pendente nesta conta. Clique em \"Resetar 2FA e tentar de novo\" para limpar e recomeçar.";
  }
  if (m.includes("invalid") && m.includes("code")) {
    return "Código incorreto. Verifique o número exibido no app e tente novamente — os códigos mudam a cada 30 segundos.";
  }
  if (m.includes("expired")) {
    return "O código expirou. Aguarde o próximo código aparecer no app e digite novamente.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Muitas tentativas seguidas. Aguarde alguns segundos antes de tentar de novo.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }
  return message;
}

async function cleanupUnverifiedFactors() {
  try {
    const { data: list } = await supabase.auth.mfa.listFactors();
    const unverified = (list?.totp ?? []).filter((f) => f.status !== "verified");
    await Promise.allSettled(
      unverified.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })),
    );
  } catch {
    // ignore
  }
}

async function adminResetMfa(): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("admin-reset-mfa", { body: {} });
    return !error;
  } catch {
    return false;
  }
}

export function MfaEnrollRequired({ onSuccess }: Props) {
  const { signOut } = useAuth();
  const [stage, setStage] = useState<Stage>("loading");
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const didBootstrap = useRef(false);
  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;
    (async () => {
      const tryEnroll = async () => {
        return await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Authenticator ${Date.now()}`,
        });
      };

      try {
        await cleanupUnverifiedFactors();
        let { data, error } = await tryEnroll();

        // If still conflicting, try admin reset and one retry
        if (error && /already exists/i.test(error.message ?? "")) {
          const ok = await adminResetMfa();
          if (ok) {
            await cleanupUnverifiedFactors();
            ({ data, error } = await tryEnroll());
          }
        }

        if (error || !data) throw error ?? new Error("Resposta vazia do servidor");
        setEnroll({
          factorId: data.id,
          qrSvg: data.totp.qr_code,
          secret: data.totp.secret,
        });
        setStage("setup");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(translateMfaError(msg));
        setStage("error");
      }
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    if (!enroll) return;
    if (!/^\d{6}$/.test(code)) {
      setFieldError("Informe os 6 dígitos exibidos no aplicativo.");
      return;
    }
    setSubmitting(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (cErr || !challenge) {
      setSubmitting(false);
      setFieldError(translateMfaError(cErr?.message));
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code,
    });
    setSubmitting(false);
    if (vErr) {
      setCode("");
      setFieldError(translateMfaError(vErr.message));
      return;
    }
    setStage("confirmed");
  };

  const copySecret = async () => {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      toast.success("Chave copiada", {
        description: "Cole no campo de configuração manual do seu aplicativo.",
      });
    } catch {
      toast.error("Não foi possível copiar", {
        description: "Selecione a chave manualmente e copie com Ctrl+C / Cmd+C.",
      });
    }
  };

  const cancel = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    await signOut();
  };

  if (stage === "loading") {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparando configuração...
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível iniciar a configuração</p>
            <p className="text-destructive/90">{errorMsg}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Sair
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await adminResetMfa();
              await cleanupUnverifiedFactors();
              window.location.reload();
            }}
          >
            Resetar 2FA e tentar de novo
          </Button>
          <Button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "confirmed") {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-2 py-2">
          <div className="rounded-full bg-primary/10 p-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">2FA ativada com sucesso</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            A partir de agora, sempre que você entrar no Aveto 360 será solicitado um código do seu
            aplicativo autenticador.
          </p>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
          <p className="font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Recomendações importantes
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Mantenha o aplicativo autenticador instalado e com backup ativado.</li>
            <li>Não desinstale o app sem antes configurar um novo dispositivo.</li>
            <li>Em caso de troca de celular, restaure o backup do autenticador antes de remover o anterior.</li>
          </ul>
        </div>

        <Button className="w-full" onClick={onSuccess}>
          Continuar para o app
        </Button>
      </div>
    );
  }

  // stage === "setup"
  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <ShieldAlert className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <span className="text-foreground">
          Para sua segurança, a autenticação em 2 fatores é <strong>obrigatória</strong>. Configure agora para acessar sua conta.
        </span>
      </div>

      <ol className="space-y-2 text-sm">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <Smartphone className="h-3.5 w-3.5" />
          </span>
          <span>
            <strong>Instale um app autenticador</strong> no celular (Google Authenticator, Authy, 1Password ou Microsoft Authenticator).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <QrCode className="h-3.5 w-3.5" />
          </span>
          <span>
            <strong>Escaneie o QR code</strong> abaixo ou cole a chave manualmente em "Adicionar conta → Inserir chave de configuração".
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
            <KeyRound className="h-3.5 w-3.5" />
          </span>
          <span>
            <strong>Digite o código de 6 dígitos</strong> exibido no app para concluir.
          </span>
        </li>
      </ol>

      {enroll && (
        <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-4">
          <div
            className="rounded bg-white p-2"
            dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
          />
          <div className="w-full max-w-sm space-y-1">
            <Label className="text-xs text-muted-foreground">Chave manual</Label>
            <div className="flex items-center gap-2">
              <Input value={enroll.secret} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copySecret} title="Copiar chave">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="totp-code">Código de verificação</Label>
          <TotpCountdown />
        </div>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            if (fieldError) setFieldError(null);
          }}
          autoFocus
          aria-invalid={!!fieldError}
          className={fieldError ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {fieldError ? (
          <p className="text-xs text-destructive flex items-start gap-1">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{fieldError}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            O código muda a cada 30 segundos. Use o mais recente exibido no app.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" onClick={cancel} disabled={submitting}>
          Sair
        </Button>
        <Button type="submit" disabled={submitting || code.length !== 6}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Ativar e continuar
        </Button>
      </div>
    </form>
  );
}
