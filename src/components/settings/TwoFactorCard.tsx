import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2, Copy } from "lucide-react";

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

interface EnrollData {
  factorId: string;
  qrSvg: string;
  secret: string;
}

export function TwoFactorCard() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const verified = factors.find((f) => f.status === "verified");

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) toast.error("Erro ao carregar fatores", { description: error.message });
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEnroll = async () => {
    setSubmitting(true);
    const { data: current } = await supabase.auth.mfa.listFactors();
    const unverified = (current?.totp ?? []).filter((f) => f.status !== "verified");
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${Date.now()}`,
    });
    setSubmitting(false);
    if (error || !data) {
      toast.error("Erro ao iniciar configuração", { description: error?.message });
      return;
    }
    setEnroll({
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const verifyEnroll = async () => {
    if (!enroll) return;
    if (!/^\d{6}$/.test(code)) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }
    setSubmitting(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
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
    toast.success("Autenticação de dois fatores ativada");
    setEnroll(null);
    setCode("");
    refresh();
  };

  const cancelEnroll = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    setEnroll(null);
    setCode("");
    refresh();
  };

  const disableMfa = async () => {
    setSubmitting(true);
    const { data: current } = await supabase.auth.mfa.listFactors();
    const all = current?.totp ?? [];
    for (const f of all) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) {
        setSubmitting(false);
        toast.error("Erro ao desativar 2FA", { description: error.message });
        return;
      }
    }
    setSubmitting(false);
    setConfirmDisable(false);
    toast.success("Autenticação de dois fatores desativada");
    refresh();
  };

  const copySecret = async () => {
    if (!enroll) return;
    await navigator.clipboard.writeText(enroll.secret);
    toast.success("Chave copiada");
  };

  const handleToggle = (checked: boolean) => {
    if (checked) {
      if (!verified && !enroll) startEnroll();
    } else {
      if (verified) setConfirmDisable(true);
      else if (enroll) cancelEnroll();
    }
  };

  const isOn = !!verified || !!enroll;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {verified ? (
              <ShieldCheck className="h-5 w-5 text-primary" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            )}
            <CardTitle className="text-lg">Autenticação em 2 fatores</CardTitle>
            {verified ? (
              <Badge variant="default">Ativada</Badge>
            ) : (
              <Badge variant="outline">Desativada</Badge>
            )}
          </div>
          <Switch
            checked={isOn}
            disabled={loading || submitting}
            onCheckedChange={handleToggle}
            aria-label="Ativar 2FA"
          />
        </div>
        <CardDescription>
          Opcional. Use o Google Authenticator (ou outro app TOTP) para proteger sua conta com um código adicional no login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : verified && !enroll ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sua conta está protegida. Você pode desativar a qualquer momento.
            </p>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setConfirmDisable(true)}
              disabled={submitting}
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              Desativar 2FA
            </Button>
          </div>
        ) : enroll ? (
          <div className="space-y-4">
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
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="ghost" onClick={cancelEnroll} disabled={submitting}>
                Cancelar
              </Button>
              <Button onClick={verifyEnroll} disabled={submitting || code.length !== 6}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar ativação
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ative o interruptor acima para configurar o app autenticador.
          </p>
        )}
      </CardContent>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar autenticação em 2 fatores?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua conta deixará de exigir o código adicional no login. Você pode reativar quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={disableMfa} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
