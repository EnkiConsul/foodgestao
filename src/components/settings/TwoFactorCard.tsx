import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Loader2, Copy } from "lucide-react";

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
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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
    // Clean up unverified leftovers
    const unverified = factors.filter((f) => f.status !== "verified");
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
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

  const removeFactor = async (id: string) => {
    setSubmitting(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setSubmitting(false);
    setConfirmRemove(null);
    if (error) {
      toast.error("Erro ao remover", { description: error.message });
      return;
    }
    toast.success("Autenticação de dois fatores desativada");
    refresh();
  };

  const copySecret = async () => {
    if (!enroll) return;
    await navigator.clipboard.writeText(enroll.secret);
    toast.success("Chave copiada");
  };

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
          </div>
          {verified ? (
            <Badge variant="default">Ativada</Badge>
          ) : (
            <Badge variant="outline">Desativada</Badge>
          )}
        </div>
        <CardDescription>
          Use o Google Authenticator (ou outro app TOTP) para proteger sua conta com um código adicional no login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : verified && !enroll ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              Sua conta está protegida. A autenticação em 2 fatores é obrigatória e não pode ser
              desativada.
            </p>
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
                Ativar 2FA
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={startEnroll} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Configurar Google Authenticator
          </Button>
        )}
      </CardContent>

    </Card>
  );
}
