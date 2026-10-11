import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { maskCpf } from "@/lib/cpf";
import { avaliarSenha } from "@/lib/security/passwordPolicy";
import { MedidorSenha } from "@/components/auth/MedidorSenha";
import { ChecklistRequisitosSenha } from "@/components/auth/ChecklistRequisitosSenha";
import { TermoPrimeiroAcesso } from "@/components/auth/TermoPrimeiroAcesso";
import { TERMO_PORTAL_VERSAO } from "@/lib/dp/termoPortal";

/** Regra única de senha nova (S3): src/lib/security/passwordPolicy.ts */
function validarSenha(senha: string): string | null {
  return avaliarSenha(senha).mensagem;
}

/**
 * Ativação e redefinição do acesso ao portal.
 *
 * O colaborador chega por um link de uso único, confirma o CPF e cria a própria
 * senha. Ninguém do escritório conhece essa senha.
 */
export default function AtivarAcesso() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const modo: "activation" | "reset" = pathname.startsWith("/redefinir-acesso") ? "reset" : "activation";
  const navigate = useNavigate();
  const codigo = (params.get("c") ?? "").trim();
  const tokenId = (params.get("t") ?? "").trim();
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkUsado, setLinkUsado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // O termo de primeiro acesso só é exigido na ativação; na redefinição de
  // senha ele já foi aceito antes.
  const exigeTermo = modo === "activation";
  const [termoAceito, setTermoAceito] = useState(false);
  const [termoPendente, setTermoPendente] = useState(false);

  const [estadoLink, setEstadoLink] = useState<"verificando" | "valido" | "usado" | "expirado" | "invalido">("verificando");

  useEffect(() => {
    // Ninguém precisa estar logado aqui; se houver sessão antiga, encerra.
    void supabase.auth.signOut();
  }, []);

  // Confere o link antes de pedir qualquer dado ao colaborador.
  useEffect(() => {
    let ativo = true;
    if (!codigo || !tokenId) { setEstadoLink("invalido"); return; }
    supabase.functions
      .invoke("dp-alterar-senha-colaborador", { body: { acao: "verificar", token_id: tokenId, codigo, purpose: modo } })
      .then(({ data, error }) => {
        if (!ativo) return;
        // Se a conferência falhar, deixa seguir: o servidor valida de novo ao salvar.
        setEstadoLink(error ? "valido" : ((data?.estado as typeof estadoLink) ?? "valido"));
      });
    return () => { ativo = false; };
  }, [codigo, tokenId, modo]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const digitos = cpf.replace(/\D/g, "");
    if (digitos.length !== 11) {
      setErro("Informe seu CPF completo");
      return;
    }
    if (!codigo || !tokenId) {
      setErro("Este link está incompleto. Peça um novo ao setor de pessoal.");
      return;
    }
    const problema = validarSenha(senha);
    if (problema) {
      setErro(problema);
      return;
    }
    if (senha !== confirmar) {
      setErro("As senhas não coincidem");
      return;
    }
    if (exigeTermo && !termoAceito) {
      setTermoPendente(true);
      setErro("Marque que você leu e concorda com o termo de primeiro acesso.");
      return;
    }
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("dp-alterar-senha-colaborador", {
        body: {
          cpf: digitos,
          token_id: tokenId,
          codigo,
          purpose: modo,
          nova_senha: senha,
          ...(exigeTermo ? { termo_aceito: true, termo_versao: TERMO_PORTAL_VERSAO } : {}),
        },
      });
      // Respostas de erro (4xx) chegam como exceção; lemos o corpo para
      // distinguir "link já utilizado" de falhas genéricas.
      let corpo: any = data;
      if (error) {
        try {
          corpo = await (error as any).context?.json();
        } catch { /* sem corpo legível */ }
        if (!corpo?.error) {
          setErro("Não foi possível concluir. Tente de novo ou peça um novo link.");
          return;
        }
      }
      if (corpo?.error) {
        if (corpo?.code === "token_usado") setLinkUsado(true);
        else if (/expirado|inválido/i.test(corpo.error)) setEstadoLink("expirado");
        setErro(corpo.error);
        return;
      }
      toast.success("Senha criada!", { description: "Entre com seu CPF e a senha que você acabou de escolher." });
      navigate(`/login?cpf=${digitos}`, { replace: true });
    } catch {
      setErro("Não foi possível concluir. Tente de novo ou peça um novo link.");
    } finally {
      setEnviando(false);
    }
  };

  const titulo = modo === "reset" ? "Criar uma nova senha" : "Ativar seu acesso";
  // Botão só libera quando a senha atende a todos os requisitos, a confirmação
  // bate e, na ativação, o termo de primeiro acesso está aceito.
  const senhaAprovada = avaliarSenha(senha, { cpf }).valida;
  const termoOk = !exigeTermo || termoAceito;

  if (estadoLink === "verificando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (estadoLink !== "valido" || linkUsado) {
    const usado = estadoLink === "usado" || linkUsado;
    const digitosCpf = cpf.replace(/\D/g, "");
    const cpfOk = digitosCpf.length === 11;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Helmet><title>Link indisponível — Aveto 360</title></Helmet>
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl font-bold">
              {usado ? "Este link já foi usado" : estadoLink === "expirado" ? "Este link expirou" : "Link inválido"}
            </CardTitle>
            <CardDescription>
              {usado
                ? "Sua senha já foi cadastrada anteriormente através deste link."
                : estadoLink === "expirado"
                  ? "Este link de acesso venceu o prazo de validade. Não se preocupe, você resolve agora mesmo."
                  : "Este link está incompleto ou não é mais válido. Você ainda pode entrar ou receber um código."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button className="min-h-11 w-full" onClick={() => navigate(cpfOk ? `/login?cpf=${digitosCpf}` : "/login", { replace: true })}>
              Entrar com meu CPF e Senha
            </Button>
            <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
              <p className="text-sm font-semibold">Não lembra sua senha ou ainda não criou?</p>
              <p className="text-xs text-muted-foreground">
                Informe seu CPF e enviaremos um código no WhatsApp cadastrado na sua ficha.
              </p>
              <Input
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value.replace(/\D/g, "").slice(0, 11)))}
                placeholder="000.000.000-00"
                aria-label="Seu CPF"
              />
              <Button
                variant="outline"
                className="min-h-11 w-full"
                disabled={!cpfOk}
                onClick={() => navigate(`/esqueci-senha?cpf=${digitosCpf}`)}
              >
                Receber código no WhatsApp
              </Button>
              <p className="text-xs text-muted-foreground">Sem WhatsApp na ficha? Procure o gestor ou o RH para incluir seu celular com DDD.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Helmet>
        <title>{titulo} — Aveto 360</title>
        <meta name="description" content="Ative seu acesso ao portal do colaborador e crie sua senha pessoal." />
      </Helmet>
      <div className="w-full max-w-md space-y-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao site
        </Link>
        <Card className="w-full shadow-lg">
          <CardHeader className="space-y-3 text-center">
            <CardTitle className="text-2xl font-bold">{titulo}</CardTitle>
            <CardDescription>
              Confirme seu CPF e escolha uma senha só sua. Este link é pessoal e serve uma única
              vez. Se outra pessoa tiver visto o link, troque a senha depois de entrar.
            </CardDescription>
          </CardHeader>
          <form onSubmit={enviar}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">Seu CPF</Label>
                <Input
                  id="cpf"
                  inputMode="numeric"
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value.replace(/\D/g, "").slice(0, 11)))}
                  placeholder="000.000.000-00"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="senha"
                    type={mostrar ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="pl-10 pr-10"
                    maxLength={72}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrar((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
                    tabIndex={-1}
                  >
                    {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <MedidorSenha senha={senha} semMensagem />
                <ChecklistRequisitosSenha senha={senha} dados={{ cpf }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmar">Confirmar nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmar"
                    type={mostrar ? "text" : "password"}
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    className="pl-10"
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </div>
                {confirmar && confirmar !== senha && (
                  <p className="text-xs text-destructive">As senhas não coincidem</p>
                )}
              </div>
              {exigeTermo && (
                <TermoPrimeiroAcesso
                  aceito={termoAceito}
                  pendente={termoPendente}
                  onAceitar={(v) => {
                    setTermoAceito(v);
                    if (v) setTermoPendente(false);
                  }}
                />
              )}
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              {linkUsado ? (
                <Button
                  type="button"
                  className="min-h-11 w-full"
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Ir para o Login
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="min-h-11 w-full"
                  disabled={enviando || !senhaAprovada || senha !== confirmar || !termoOk}
                >
                  {enviando ? "Salvando..." : "Salvar senha e entrar"}
                </Button>
              )}
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
