import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  applyConsentMetaHardening,
  clearConsentNonce,
  createConsentNonce,
  isFramed,
  verifyConsentNonce,
} from "@/lib/security/consentSecurity";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      applyConsentMetaHardening();
      if (isFramed()) {
        setError("Esta solicitação não pode ser exibida dentro de outro site.");
        return;
      }
      if (!authorizationId) {
        setError("Solicitação inválida: authorization_id ausente.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/auth?redirect=${encodeURIComponent(next)}`;
        return;
      }
      setAccountEmail(sess.session.user?.email ?? null);
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setNonce(createConsentNonce(authorizationId));
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (!verifyConsentNonce(authorizationId, nonce)) {
      setError("Não foi possível validar a origem desta solicitação. Recarregue a página.");
      return;
    }
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    clearConsentNonce(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou o redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "o aplicativo";
  const scopeLabels: Record<string, string> = {
    openid: "Identificar sua conta",
    email: "Compartilhar seu endereço de e-mail",
    profile: "Compartilhar seu perfil básico",
  };
  const scopes: string[] = String(details?.scope ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const redirectHost = (() => {
    const uri = details?.client?.redirect_uri ?? details?.redirect_uri;
    if (!uri) return null;
    try {
      return new URL(uri).host;
    } catch {
      return null;
    }
  })();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle>
            {error ? "Não foi possível continuar" : `Conectar ${clientName} à sua conta`}
          </CardTitle>
          <CardDescription>
            {error
              ? error
              : `${clientName} poderá consultar os dados do Aveto 360 com as suas permissões de acesso.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!error && !details ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando solicitação…
            </div>
          ) : !error ? (
            <div className="space-y-4">
              {accountEmail ? (
                <p className="text-sm text-muted-foreground" data-testid="consent-account">
                  Conta conectada: <span className="font-medium text-foreground">{accountEmail}</span>
                </p>
              ) : null}
              {redirectHost ? (
                <p className="text-sm text-muted-foreground" data-testid="consent-redirect">
                  Redireciona para {redirectHost}
                </p>
              ) : null}
              {scopes.length ? (
                <ul className="space-y-1 text-sm" data-testid="consent-scopes">
                  {scopes.map((s) => (
                    <li key={s}>• {scopeLabels[s] ?? `Permissão adicional solicitada: ${s}`}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Isso não ignora as permissões e políticas de acesso do Aveto 360.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Autorizar
                </Button>
                <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                  Recusar
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
