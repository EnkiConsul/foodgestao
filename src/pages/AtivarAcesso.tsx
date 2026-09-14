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

/** Regra alinhada ao servidor de contas e ao servidor da ativação. */
function validarSenha(senha: string): string | null {
  if (senha.length < 8) return "Use pelo menos 8 caracteres";
  if (!/[A-Z]/.test(senha)) return "Inclua ao menos 1 letra maiúscula";
  if (!/[a-z]/.test(senha)) return "Inclua ao menos 1 letra minúscula";
  if (!/[0-9]/.test(senha)) return "Inclua ao menos 1 número";
  if (!/[^A-Za-z0-9]/.test(senha)) return "Inclua ao menos 1 símbolo, como ! @ # ou *";
  return null;
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
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Ninguém precisa estar logado aqui; se houver sessão antiga, encerra.
    void supabase.auth.signOut();
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const digitos = cpf.replace(/\D/g, "");
    if (digitos.length !== 11) {
      setErro("Informe seu CPF completo");
      return;
    }
    if (!codigo) {
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
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("dp-alterar-senha-colaborador", {
        body: { cpf: digitos, codigo, nova_senha: senha },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        setErro((data as any).error);
        return;
      }
      toast.success("Senha criada!", { description: "Entre com seu CPF e a senha que você acabou de escolher." });
      navigate("/auth", { replace: true });
    } catch {
      setErro("Não foi possível concluir. Tente de novo ou peça um novo link.");
    } finally {
      setEnviando(false);
    }
  };

  const titulo = modo === "reset" ? "Criar uma nova senha" : "Ativar seu acesso";

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
              Confirme seu CPF e escolha uma senha só sua. Este link serve uma única vez.
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
                <p className="text-xs text-muted-foreground">
                  Pelo menos 8 caracteres, com maiúscula, minúscula, número e um símbolo (ex.: Ale!2026).
                </p>
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
              </div>
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              <Button type="submit" className="min-h-11 w-full" disabled={enviando}>
                {enviando ? "Salvando..." : "Salvar senha e entrar"}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
