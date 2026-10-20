import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { portalPublico, proximaEtapa, talentoEntrar, talentoStatus } from "@/lib/recrutamento/portal";
import assinatura360 from "@/assets/aveto360-assinatura.png.asset.json";

export default function PortalTalentos() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const [logado, setLogado] = useState<boolean | null>(null);
  const [opcao, setOpcao] = useState<"empresa" | "geral" | "">("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setLogado(!!data.user)); }, []);
  const portal = useQuery({ queryKey: ["portal-publico", slug], queryFn: () => portalPublico(slug) });
  const st = useQuery({ queryKey: ["talento-status", slug], enabled: logado === true, queryFn: () => talentoStatus(slug) });

  const voltar = encodeURIComponent(`/carreiras/${slug}/talentos`);
  if (logado === false) return <Navigate to={`/candidato/acesso?voltar=${voltar}`} replace />;

  const etapa = logado && st.data ? proximaEtapa(true, st.data) : null;
  if (etapa === "perfil") return <Navigate to={`/candidato?voltar=${voltar}`} replace />;

  const confirmar = async () => {
    if (!opcao) return;
    setErro(null); setEnviando(true);
    try {
      const r = await talentoEntrar(slug, opcao === "geral");
      setResultado(r.resultado);
      qc.invalidateQueries({ queryKey: ["talento-status", slug] });
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setEnviando(false); }
  };

  const empresa = portal.data?.empresa ?? "esta empresa";
  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <Helmet><title>Banco de Talentos — {empresa} | AVETO</title><meta name="robots" content="noindex" /></Helmet>
      <header className="bg-background border-b">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between">
          <img src={assinatura360.url} alt="AVETO 360" className="h-8 w-auto" />
          <Button asChild variant="ghost" size="sm"><Link to="/candidato">Meu perfil</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-5 space-y-4">
        {(logado === null || st.isLoading || portal.isLoading) && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {(st.isError || (portal.isSuccess && !portal.data)) && <Card><CardContent className="p-5 text-sm">Portal não encontrado.</CardContent></Card>}
        {erro && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

        {etapa === "avaliacao" && (
          <Card><CardContent className="p-5 space-y-3 text-sm">
            <h1 className="text-lg font-semibold">Falta a Avaliação Food Service 360</h1>
            <p>Para entrar no Banco de Talentos da {empresa}, conclua a avaliação obrigatória. Ela vale por 12 meses e é usada em todas as empresas.</p>
            <Button asChild className="w-full h-11"><Link to={`/candidato/avaliacao?voltar=${voltar}`}>Fazer avaliação</Link></Button>
          </CardContent></Card>
        )}

        {etapa === "autorizar" && (
          <Card><CardContent className="p-5 space-y-4">
            <h1 className="text-lg font-semibold">Autorização de participação</h1>
            <p className="text-sm text-muted-foreground">Escolha como quer disponibilizar seu perfil. Você pode mudar ou retirar quando quiser no seu perfil.</p>
            <RadioGroup value={opcao} onValueChange={(v) => setOpcao(v as "empresa" | "geral")} className="space-y-2">
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer">
                <RadioGroupItem value="empresa" className="mt-0.5" />
                <span><b>Somente esta empresa</b><br />Quero disponibilizar meu perfil para futuras oportunidades desta empresa.</span>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer">
                <RadioGroupItem value="geral" className="mt-0.5" />
                <span><b>Esta empresa e outras empresas AVETO</b><br />Também quero participar do Banco Geral de Talentos AVETO, para receber oportunidades de outras empresas.</span>
              </label>
            </RadioGroup>
            {st.data?.banco_geral && <p className="text-xs text-muted-foreground">Você já participa do Banco Geral AVETO. Para sair dele, use seu perfil.</p>}
            <p className="text-xs text-muted-foreground">Não mostramos seu CPF nem sua data de nascimento às empresas.</p>
            <Button className="w-full h-11" disabled={!opcao || enviando} onClick={confirmar}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar participação
            </Button>
          </CardContent></Card>
        )}

        {etapa === "concluido" && (
          <Card><CardContent className="p-5 space-y-3 text-sm">
            <h1 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" /> Cadastro concluído</h1>
            <p>{resultado === "ativado" ? "Agora você faz parte" : "Você já faz parte"} do Banco de Talentos da {empresa}.</p>
            {st.data?.autorizado_em && <p className="text-xs text-muted-foreground">Autorizado em {new Date(st.data.autorizado_em).toLocaleDateString("pt-BR")}.</p>}
            <Button asChild variant="outline" className="w-full h-11"><Link to={`/carreiras/${slug}`}>Ver vagas da empresa</Link></Button>
            <Button asChild variant="ghost" className="w-full h-11"><Link to="/candidato">Gerenciar minhas autorizações</Link></Button>
          </CardContent></Card>
        )}
      </main>
    </div>
  );
}
