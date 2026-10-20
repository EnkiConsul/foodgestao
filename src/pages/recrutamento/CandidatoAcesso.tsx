import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { ChecklistRequisitosSenha } from "@/components/auth/ChecklistRequisitosSenha";
import { useTurnstileConfig } from "@/hooks/useTurnstileSiteKey";
import { maskCpf } from "@/lib/cpf";
import { chamarAuthCandidato, destinoSeguro } from "@/lib/recrutamento/candidato";
import assinatura360 from "@/assets/aveto360-assinatura.png.asset.json";

type Modo = "entrar" | "cadastrar" | "recuperar";
type Sessao = { access_token: string; refresh_token: string } | null;

const soDigitos = (s: string) => s.replace(/\D+/g, "");

export default function CandidatoAcesso() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const destino = destinoSeguro(params.get("voltar"));
  const { siteKey } = useTurnstileConfig();

  const [modo, setModo] = useState<Modo>(params.get("modo") === "cadastrar" ? "cadastrar" : "entrar");
  const [token, setToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [aceite, setAceite] = useState(false);
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  const trocarModo = (m: string) => {
    setModo(m as Modo); setErro(null); setAviso(null); setDesafio(null); setCodigo(""); setSenha("");
  };
  const renovarCaptcha = () => { setToken(""); setWidgetKey((k) => k + 1); };

  const entrarComSessao = async (s: Sessao, temPerfil = true) => {
    if (!s) { setErro("Acesso criado. Entre com seu CPF e senha."); trocarModo("entrar"); return; }
    await supabase.auth.setSession(s);
    navigate(temPerfil ? destino : `/candidato?voltar=${encodeURIComponent(destino)}`, { replace: true });
  };

  const executar = async (fn: () => Promise<void>) => {
    setErro(null); setCarregando(true);
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : "Erro inesperado."); renovarCaptcha(); }
    finally { setCarregando(false); }
  };

  const onEntrar = () => executar(async () => {
    const r = await chamarAuthCandidato<{ session: Sessao; tem_perfil: boolean }>({
      acao: "login", cpf: soDigitos(cpf), senha, turnstile_token: token,
    });
    await entrarComSessao(r.session, r.tem_perfil);
  });

  const onCadastroIniciar = () => executar(async () => {
    const r = await chamarAuthCandidato<{ desafio_id: string; final: string }>({
      acao: "cadastro_iniciar", cpf: soDigitos(cpf), nome: nome.trim(), data_nascimento: nascimento,
      whatsapp, aceite: true, turnstile_token: token,
    });
    setDesafio(r.desafio_id);
    setAviso(`Enviamos um código para o WhatsApp terminado em ${r.final}.`);
  });

  const onCadastroConcluir = () => executar(async () => {
    const r = await chamarAuthCandidato<{ session: Sessao }>({ acao: "cadastro_concluir", desafio_id: desafio, codigo, senha });
    await entrarComSessao(r.session, true);
  });

  const onRecuperarIniciar = () => executar(async () => {
    const r = await chamarAuthCandidato<{ desafio_id: string; mensagem: string }>({
      acao: "recuperar_iniciar", cpf: soDigitos(cpf), data_nascimento: nascimento, turnstile_token: token,
    });
    setDesafio(r.desafio_id); setAviso(r.mensagem);
  });

  const onRecuperarConcluir = () => executar(async () => {
    await chamarAuthCandidato({ acao: "recuperar_concluir", desafio_id: desafio, codigo, senha });
    trocarModo("entrar");
    setAviso("Senha alterada. Entre com seu CPF e a nova senha.");
  });

  const captcha = siteKey ? (
    <TurnstileWidget key={widgetKey} siteKey={siteKey} onToken={setToken} onExpire={() => setToken("")} />
  ) : null;

  const campoCpf = (
    <div className="space-y-1.5">
      <Label htmlFor="cpf">CPF</Label>
      <Input id="cpf" inputMode="numeric" autoComplete="username" value={cpf}
        onChange={(e) => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" />
    </div>
  );
  const campoNascimento = (
    <div className="space-y-1.5">
      <Label htmlFor="nasc">Data de nascimento</Label>
      <Input id="nasc" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
    </div>
  );
  const etapaCodigo = (onConfirmar: () => void, rotulo: string) => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="codigo">Código recebido no WhatsApp</Label>
        <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
          onChange={(e) => setCodigo(soDigitos(e.target.value).slice(0, 6))} placeholder="000000" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nova">Crie sua senha</Label>
        <Input id="nova" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <ChecklistRequisitosSenha senha={senha} dados={{ nome, cpf: soDigitos(cpf) }} />
      </div>
      <Button className="w-full h-11" disabled={carregando || codigo.length !== 6 || !senha} onClick={onConfirmar}>
        {carregando && <Loader2 className="h-4 w-4 animate-spin" />} {rotulo}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => { setDesafio(null); setCodigo(""); setAviso(null); renovarCaptcha(); }}>
        Pedir outro código
      </Button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-6">
      <Helmet><title>Acesso do candidato — AVETO Recrutamento 360</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={assinatura360.url} alt="AVETO 360" className="h-8 w-auto" />
          <h1 className="text-xl font-semibold">Área do candidato</h1>
          <p className="text-sm text-muted-foreground">Seu acesso para se candidatar às vagas.</p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <Tabs value={modo} onValueChange={trocarModo}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="cadastrar">Criar cadastro</TabsTrigger>
              </TabsList>
            </Tabs>

            {aviso && <p role="status" className="rounded-md bg-muted p-3 text-sm">{aviso}</p>}
            {erro && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

            {modo === "entrar" && (
              <div className="space-y-4">
                {campoCpf}
                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <Input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
                </div>
                {captcha}
                <Button className="w-full h-11" disabled={carregando || soDigitos(cpf).length !== 11 || !senha || !token} onClick={onEntrar}>
                  {carregando && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
                </Button>
                <button type="button" className="w-full text-sm text-primary underline-offset-4 hover:underline" onClick={() => trocarModo("recuperar")}>
                  Esqueci minha senha
                </button>
                <p className="text-xs text-muted-foreground">
                  Já é colaborador de uma empresa AVETO? Use o mesmo CPF e senha do portal.
                </p>
              </div>
            )}

            {modo === "cadastrar" && !desafio && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input id="nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                {campoCpf}
                {campoNascimento}
                <div className="space-y-1.5">
                  <Label htmlFor="wa">WhatsApp com DDD</Label>
                  <Input id="wa" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(62) 99999-9999" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                  <span>
                    Declaro que os dados são verdadeiros e autorizo seu uso para processos seletivos, conforme a{" "}
                    <Link to="/privacidade" className="text-primary underline" target="_blank">Política de Privacidade</Link>.
                  </span>
                </label>
                {captcha}
                <Button className="w-full h-11" disabled={carregando || !aceite || !token || nome.trim().length < 5 || soDigitos(cpf).length !== 11 || !nascimento || soDigitos(whatsapp).length < 10}
                  onClick={onCadastroIniciar}>
                  {carregando && <Loader2 className="h-4 w-4 animate-spin" />} Receber código no WhatsApp
                </Button>
              </div>
            )}
            {modo === "cadastrar" && desafio && etapaCodigo(onCadastroConcluir, "Criar meu acesso")}

            {modo === "recuperar" && !desafio && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Informe seu CPF e data de nascimento. O código vai para o WhatsApp do seu cadastro de candidato.
                </p>
                {campoCpf}
                {campoNascimento}
                {captcha}
                <Button className="w-full h-11" disabled={carregando || !token || soDigitos(cpf).length !== 11 || !nascimento} onClick={onRecuperarIniciar}>
                  {carregando && <Loader2 className="h-4 w-4 animate-spin" />} Enviar código
                </Button>
                <p className="text-xs text-muted-foreground">
                  Se você também é colaborador ou gestor, recupere a senha pela tela de login principal.
                </p>
                <Button variant="ghost" className="w-full" onClick={() => trocarModo("entrar")}>Voltar para entrar</Button>
              </div>
            )}
            {modo === "recuperar" && desafio && etapaCodigo(onRecuperarConcluir, "Salvar nova senha")}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
