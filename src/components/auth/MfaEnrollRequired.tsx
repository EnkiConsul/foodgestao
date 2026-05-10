import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onSuccess: () => void;
}

interface EnrollData {
  factorId: string;
  qrSvg: string;
  secret: string;
}

export function MfaEnrollRequired({ onSuccess }: Props) {
  const { signOut } = useAuth();
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      // Limpa fatores não verificados de tentativas anteriores
      const { data: list } = await supabase.auth.mfa.listFactors();
      const unverified = (list?.totp ?? []).filter((f) => f.status !== "verified");
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || !data) {
        toast.error("Erro ao iniciar configuração", { description: error?.message });
        setLoading(false);
        return;
      }
      setEnroll({
        factorId: data.id,
        qrSvg: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setLoading(false);
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }
    setSubmitting(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (cErr || !challenge) {
      setSubmitting(false);
      toast.error("Erro no desafio MFA", { description: cErr?.message });
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code,
    });
    setSubmitting(false);
    if (vErr) {
      toast.error("Código inválido", { description: vErr.message });
      return;
    }
    toast.success("Autenticação em 2 fatores ativada");
    onSuccess();
  };

  const copySecret = async () => {
    if (!enroll) return;
    await navigator.clipboard.writeText(enroll.secret);
    toast.success("Chave copiada");
  };

  const cancel = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    await signOut();
  };

  if (loading || !enroll) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparando configuração...
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <span>
          Para sua segurança, a autenticação em 2 fatores é obrigatória. Configure agora para acessar
          sua conta.
        </span>
      </div>

      <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
        <li>Abra o Google Authenticator no seu celular.</li>
        <li>Escaneie o QR code abaixo ou insira a chave manualmente.</li>
        <li>Digite o código de 6 dígitos gerado pelo app.</li>
      </ol>

      <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-4">
        <div
          className="rounded bg-white p-2"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
        />
        <div className="flex items-center gap-2 w-full max-w-sm">
          <Input value={enroll.secret} readOnly className="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" onClick={copySecret}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="totp-code">Código de verificação</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
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
