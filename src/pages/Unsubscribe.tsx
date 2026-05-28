import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { TreePine, Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Status = "validating" | "valid" | "already" | "invalid" | "confirming" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("validating");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
    fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.valid) setStatus("valid");
        else if (data.reason === "already_unsubscribed") setStatus("already");
        else setStatus("invalid");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const confirm = async () => {
    setStatus("confirming");
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    if (data?.reason === "already_unsubscribed") {
      setStatus("already");
      return;
    }
    setStatus("done");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Helmet>
        <title>Cancelar inscrição · Gestor Plin</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <TreePine className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">Cancelar inscrição</h1>

          {status === "validating" && (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando link...
            </div>
          )}

          {status === "valid" && (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                Confirme abaixo para deixar de receber e-mails do Gestor Plin neste endereço.
              </p>
              <Button onClick={confirm} className="mt-6 w-full">
                Confirmar cancelamento
              </Button>
            </>
          )}

          {status === "confirming" && (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando...
            </div>
          )}

          {status === "done" && (
            <div className="mt-6 space-y-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="text-sm">Inscrição cancelada. Você não receberá mais e-mails neste endereço.</p>
            </div>
          )}

          {status === "already" && (
            <div className="mt-6 space-y-2">
              <MailX className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Este e-mail já foi removido da nossa lista.</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="mt-6 space-y-2">
              <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
              <p className="text-sm text-muted-foreground">Link inválido ou expirado.</p>
            </div>
          )}

          {status === "error" && (
            <div className="mt-6 space-y-2">
              <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
              <p className="text-sm text-muted-foreground">{error ?? "Erro ao processar."}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
