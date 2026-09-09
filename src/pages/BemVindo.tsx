import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { usePendingInvites } from "@/hooks/usePendingInvites";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Building2, CheckCircle, Loader2, LogOut, MailOpen } from "lucide-react";
import { toast } from "sonner";

const roleLabel: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
  viewer: "Visualizador",
  contabilidade: "Contabilidade",
};

export default function BemVindo() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: invites, isLoading } = usePendingInvites();
  const { refreshCompanies, setContext } = useCompanyContext();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const handleAccept = async (inviteId: string, token: string, companyId: string) => {
    setAcceptingId(inviteId);
    try {
      const { data, error } = await supabase.functions.invoke("accept-invite", { body: { token } });
      const errMsg = (data as any)?.error || error?.message;
      if (errMsg) {
        toast.error("Não foi possível aceitar o convite", { description: errMsg });
        return;
      }
      toast.success("Convite aceito!", {
        description: `Você já tem acesso a ${(data as any)?.company_name ?? "empresa"}.`,
      });
      qc.invalidateQueries({ queryKey: ["pending-invites"] });
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
      qc.invalidateQueries({ queryKey: ["company-access"] });
      await refreshCompanies();
      setContext("pj", companyId);
      navigate("/hub", { replace: true });
    } finally {
      setAcceptingId(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-center">
          <Logo size="md" linkTo={null} />
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Bem-vindo!</CardTitle>
            <CardDescription>
              Você pode entrar em uma empresa que te convidou ou criar a sua própria empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <MailOpen className="h-4 w-4 text-primary" />
                Convites recebidos
              </p>

              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando convites...
                </div>
              ) : (invites?.length ?? 0) === 0 ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Você não tem convites pendentes. Se alguém te convidou, peça para reenviar o convite
                  para este mesmo e-mail.
                </div>
              ) : (
                <ul className="space-y-2">
                  {invites!.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{inv.company_name ?? "Empresa"}</p>
                        <p className="text-xs text-muted-foreground">
                          Acesso como {roleLabel[inv.role] ?? inv.role} · válido até{" "}
                          {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleAccept(inv.id, inv.token, inv.company_id)}
                        disabled={acceptingId !== null}
                        className="min-h-10 shrink-0"
                      >
                        {acceptingId === inv.id ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando...</>
                        ) : (
                          <><CheckCircle className="h-4 w-4 mr-2" />Aceitar e entrar</>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Quero minha própria empresa
              </p>
              <p className="text-sm text-muted-foreground">
                Cadastre sua empresa para começar a usar a plataforma com seus próprios dados.
              </p>
              <Button variant="outline" onClick={() => navigate("/onboarding")} className="min-h-10">
                Criar minha empresa
              </Button>
            </div>

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
