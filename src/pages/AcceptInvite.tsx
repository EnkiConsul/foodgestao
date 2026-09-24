import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { MedidorSenha } from "@/components/auth/MedidorSenha";
import { avaliarSenha } from "@/lib/security/passwordPolicy";
import { INVITE_TOKEN_KEY } from "@/lib/auth/invite";

type Info = { nome: string | null; empresas: string[]; login: "email" | "whatsapp"; login_hint: string; conta_existe: boolean };
type Status = "loading" | "ready" | "criar" | "accepted" | "error" | "expired";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [info, setInfo] = useState<Info | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!token) { setStatus("error"); return; }
    if (user) { setStatus("ready"); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("invite-signup", { body: { action: "info", token } });
      const d = data as any;
      if (error || d?.error) {
        const code = d?.code ?? (error as any)?.context?.status;
        setStatus(code === "expirado" || code === 410 ? "expired" : "error");
        return;
      }
      setInfo(d as Info);
      setStatus("criar");
    })();
  }, [user, authLoading, token]);

  const irParaLogin = () => {
    try { sessionStorage.setItem(INVITE_TOKEN_KEY, token ?? ""); } catch { /* noop */ }
    navigate("/auth", { replace: true });
  };

  const handleAccept = async () => {
    if (!user || !token) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("accept-invite", { body: { token } });
    const msg = (data as any)?.error || error?.message;
    if (msg) {
      if (/expirad|expired/i.test(msg)) setStatus("expired");
      else { setStatus("error"); toast.error("Erro ao aceitar convite", { description: msg }); }
    } else {
      setStatus("accepted");
      setCompanyName((data as any)?.company_name ?? "");
    }
    setBusy(false);
  };

  const aval = avaliarSenha(senha, { nome: info?.nome });
  const podeCriar = aval.valida && senha === confirma;

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !podeCriar) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-signup", {
      body: { action: "criar_conta", token, password: senha },
    });
    const d = data as any;
    if (error || d?.error) {
      if (d?.code === "conta_existe") { toast.info(d.error); irParaLogin(); }
      else toast.error("Não foi possível criar a conta", { description: d?.error ?? "Tente novamente." });
      setBusy(false);
      return;
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: d.login_email, password: senha });
    setBusy(false);
    if (signErr) { toast.success("Conta criada! Entre com sua senha."); navigate("/auth"); return; }
    setCompanyName((d.empresas ?? []).join(", "));
    setStatus("accepted");
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
        {status === "criar" && info && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Bem-vindo{info.nome ? `, ${info.nome.split(" ")[0]}` : ""}!</CardTitle>
              <CardDescription>
                Você foi convidado para acessar {info.empresas.join(", ") || "uma empresa"} no Aveto 360.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {info.conta_existe ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">Você já tem conta. Entre com sua senha para aceitar o convite.</p>
                  <Button className="w-full min-h-11" onClick={irParaLogin}>Entrar</Button>
                </div>
              ) : (
                <form onSubmit={handleCriar} className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Seu login será o {info.login === "email" ? "e-mail" : "WhatsApp"} <strong>{info.login_hint}</strong>.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha">Crie sua senha</Label>
                    <Input id="senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} aria-describedby="medidor" />
                    <MedidorSenha senha={senha} dados={{ nome: info.nome }} id="medidor" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirma">Confirme a senha</Label>
                    <Input id="confirma" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
                    {confirma && confirma !== senha && <p className="text-[11px] text-destructive">As senhas não conferem</p>}
                  </div>
                  <Button type="submit" className="w-full min-h-11" disabled={busy || !podeCriar}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar senha e entrar"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={irParaLogin}>Já tenho conta</Button>
                </form>
              )}
            </CardContent>
          </>
        )}

        {status === "ready" && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Convite para Empresa</CardTitle>
              <CardDescription>Você recebeu um convite para se juntar a uma empresa no Aveto 360.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <Button onClick={handleAccept} disabled={busy} className="w-full min-h-11">
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aceitando...</> : <><CheckCircle className="h-4 w-4 mr-2" />Aceitar Convite</>}
              </Button>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full min-h-10">Cancelar</Button>
            </CardContent>
          </>
        )}

        {status === "accepted" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2"><CheckCircle className="h-12 w-12 text-primary" /></div>
              <CardTitle>Acesso Liberado!</CardTitle>
              <CardDescription>Você agora faz parte de{companyName ? ` ${companyName}` : " uma empresa"}.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/hub")} className="w-full">Começar</Button>
            </CardContent>
          </>
        )}

        {(status === "expired" || status === "error") && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2"><XCircle className="h-12 w-12 text-destructive" /></div>
              <CardTitle>{status === "expired" ? "Convite Expirado" : "Convite Inválido"}</CardTitle>
              <CardDescription>
                {status === "expired"
                  ? "Este convite expirou ou já foi utilizado. Peça um novo ao administrador da empresa."
                  : "Não foi possível abrir este convite. Verifique o link ou peça um novo convite."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full">Voltar ao Início</Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
