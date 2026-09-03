import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "accepted" | "error" | "expired">("loading");
  const [invite, setInvite] = useState<any>(null);
  const [companyName, setCompanyName] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Save token and redirect to auth
      sessionStorage.setItem("invite_token", token ?? "");
      navigate("/auth", { replace: true });
      return;
    }

    // Fetch invite via RPC or direct query - we need a public way to read invite by token
    // Since RLS blocks non-members, we use an edge function or rpc. For now, use service approach:
    // We'll try to accept directly - the accept function will validate
    fetchInvite();
  }, [user, authLoading, token]);

  const fetchInvite = async () => {
    if (!token) {
      setStatus("error");
      return;
    }

    // We need to read the invite. Since RLS may block, we try anyway (user might already be admin)
    // For the general case, we'll attempt to accept directly
    setStatus("ready");
  };

  const handleAccept = async () => {
    if (!user || !token) return;
    setAccepting(true);

    // Call edge function to accept invite (bypasses RLS)
    const { data, error } = await supabase.functions.invoke("accept-invite", {
      body: { token },
    });

    if (error || data?.error) {
      const msg = data?.error || error?.message || "Erro desconhecido";
      if (msg.includes("expirado") || msg.includes("expired")) {
        setStatus("expired");
      } else {
        setStatus("error");
        toast.error("Erro ao aceitar convite", { description: msg });
      }
    } else {
      setStatus("accepted");
      setCompanyName(data?.company_name ?? "");
      toast.success("Convite aceito com sucesso!");
    }
    setAccepting(false);
  };

  if (authLoading || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {status === "ready" && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Convite para Empresa</CardTitle>
              <CardDescription>
                Você recebeu um convite para se juntar a uma empresa no Aveto 360.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <Button onClick={handleAccept} disabled={accepting} className="w-full min-h-11">
                {accepting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aceitando...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" />Aceitar Convite</>
                )}
              </Button>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full min-h-10">
                Cancelar
              </Button>
            </CardContent>
          </>
        )}

        {status === "accepted" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Convite Aceito!</CardTitle>
              <CardDescription>
                Você agora é membro da empresa{companyName ? ` "${companyName}"` : ""}. Os dados financeiros compartilhados já estão disponíveis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/")} className="w-full">
                Ir para o Dashboard
              </Button>
            </CardContent>
          </>
        )}

        {status === "expired" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2">
                <XCircle className="h-12 w-12 text-amber-500" />
              </div>
              <CardTitle>Convite Expirado</CardTitle>
              <CardDescription>
                Este convite expirou ou já foi utilizado. Solicite um novo convite ao administrador da empresa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full">
                Voltar ao Início
              </Button>
            </CardContent>
          </>
        )}

        {status === "error" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle>Erro no Convite</CardTitle>
              <CardDescription>
                Não foi possível processar este convite. Verifique se o link está correto ou solicite um novo convite.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full">
                Voltar ao Início
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
