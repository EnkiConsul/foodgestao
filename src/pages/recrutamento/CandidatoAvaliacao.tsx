import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Timer, CheckCircle2, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AREAS } from "@/lib/recrutamento/candidato";
import {
  FAIXA_ROTULO, avalAtual, avalIniciar, avalResponder, avalStatus, segundosRestantes,
  type AvalPergunta, type AvalStatus,
} from "@/lib/recrutamento/avaliacao";
import assinatura360 from "@/assets/aveto360-assinatura.png.asset.json";

const rotuloArea = (id?: string) => (id === "geral" ? "Rotina geral" : AREAS.find((a) => a.id === id)?.rotulo ?? "");

export default function CandidatoAvaliacao() {
  const [params] = useSearchParams();
  const area = params.get("area");
  const [sessao, setSessao] = useState<"carregando" | "sem" | "com">("carregando");
  const [status, setStatus] = useState<AvalStatus | null>(null);
  const [p, setP] = useState<AvalPergunta | null>(null);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resta, setResta] = useState(0);
  const desvio = useRef(0);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setSessao(data.user ? "com" : "sem")); }, []);

  const carregarPergunta = useCallback(async () => {
    const t0 = Date.now();
    const r = await avalAtual();
    if (r.prazo_em && typeof r.segundos_restantes === "number") {
      // desvio entre o relógio do aparelho e o do servidor
      desvio.current = new Date(r.prazo_em).getTime() - r.segundos_restantes * 1000 - (t0 + Date.now()) / 2;
    }
    setEscolha(null); setP(r);
    if (!r.em_andamento) setStatus(await avalStatus());
  }, []);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const s = await avalStatus();
      setStatus(s);
      if (s.em_andamento) await carregarPergunta();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro inesperado."); }
  }, [carregarPergunta]);

  useEffect(() => { if (sessao === "com") carregar(); }, [sessao, carregar]);

  useEffect(() => {
    if (!p?.prazo_em) return;
    const tick = () => setResta(segundosRestantes(p.prazo_em!, desvio.current));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [p?.prazo_em]);

  useEffect(() => {
    if (p?.em_andamento && p.prazo_em && resta === 0 && !enviando) {
      setAviso("O tempo desta pergunta terminou. Seguimos para a próxima.");
      const id = window.setTimeout(() => carregarPergunta().catch(() => undefined), 1500);
      return () => window.clearTimeout(id);
    }
  }, [resta, p, enviando, carregarPergunta]);

  if (sessao === "sem") return <Navigate to={`/candidato/acesso?voltar=${encodeURIComponent("/candidato/avaliacao")}`} replace />;

  const iniciar = async () => {
    setErro(null); setEnviando(true);
    try { await avalIniciar(area); await carregarPergunta(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setEnviando(false); }
  };

  const confirmar = async () => {
    if (!p?.item_id || !escolha) return;
    setErro(null); setAviso(null); setEnviando(true);
    try {
      const r = await avalResponder(p.item_id, escolha);
      if (r.expirada) setAviso("O tempo desta pergunta já tinha terminado. Seguimos para a próxima.");
      await carregarPergunta();
    } catch (e) {
      setErro(navigator.onLine ? (e instanceof Error ? e.message : "Erro inesperado.") : "Sem conexão. Sua resposta não foi enviada; tente de novo.");
    } finally { setEnviando(false); }
  };

  const faltaArea = !!area && !!status?.valida && !(status.areas_cobertas ?? []).includes(area);
  const pct = p?.total ? Math.round(((p.ordem ?? 1) - 1) * 100 / p.total) : 0;
  const seg = status?.segundos_por_pergunta ?? 60;

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-6">
      <Helmet><title>Avaliação Food Service 360 — AVETO</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div className="flex items-center justify-between gap-2">
          <img src={assinatura360.url} alt="AVETO 360" className="h-7 w-auto" />
          <Button asChild variant="ghost" size="sm"><Link to="/candidato">Meu perfil</Link></Button>
        </div>

        {erro && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
        {aviso && <p role="status" className="rounded-md bg-muted p-3 text-sm">{aviso}</p>}
        {(sessao === "carregando" || (!status && !erro)) && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}

        {status && !status.tem_perfil && (
          <Card><CardContent className="p-5 space-y-3 text-sm">
            <p>Ative seu perfil de candidato antes da avaliação.</p>
            <Button asChild className="w-full h-11"><Link to="/candidato">Ir para meu perfil</Link></Button>
          </CardContent></Card>
        )}

        {status?.tem_perfil && !status.perfil_completo && (
          <Card><CardContent className="p-5 space-y-3 text-sm">
            <p>Escolha suas áreas de interesse no perfil profissional para liberar a avaliação.</p>
            <Button asChild className="w-full h-11"><Link to="/candidato">Completar perfil</Link></Button>
          </CardContent></Card>
        )}

        {p?.em_andamento && p.enunciado && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pergunta {p.ordem} de {p.total}</span>
                <span className={`flex items-center gap-1 font-medium tabular-nums ${resta <= 10 ? "text-destructive" : ""}`} aria-live="polite">
                  <Timer className="h-4 w-4" /> {resta}s
                </span>
              </div>
              <Progress value={pct} aria-label="Progresso da avaliação" />
            </div>
            <Card>
              <CardContent className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">{rotuloArea(p.area)} · {p.competencia}</p>
                <h1 className="text-base font-semibold leading-snug">{p.enunciado}</h1>
                <div role="radiogroup" aria-label="Alternativas" className="space-y-2">
                  {p.opcoes?.map((o) => (
                    <Button key={o.id} type="button" role="radio" aria-checked={escolha === o.id}
                      variant={escolha === o.id ? "default" : "outline"} disabled={enviando || resta === 0}
                      className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left"
                      onClick={() => setEscolha(o.id)}>
                      {o.texto}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3">
              <Button className="h-11 w-full" disabled={!escolha || enviando || resta === 0} onClick={confirmar}>
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar resposta
              </Button>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">Depois de confirmar, não é possível voltar.</p>
            </div>
          </div>
        )}

        {status?.perfil_completo && !status.em_andamento && !p?.em_andamento && (
          <>
            {status.valida && !faltaArea ? (
              <Card><CardContent className="p-5 space-y-3">
                <h1 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" /> Avaliação concluída</h1>
                {status.faixa && <>
                  <p className="text-sm font-medium">{FAIXA_ROTULO[status.faixa].titulo}</p>
                  <p className="text-sm text-muted-foreground">{FAIXA_ROTULO[status.faixa].texto}</p>
                </>}
                <p className="text-xs text-muted-foreground">
                  Resultado orientativo, não eliminatório. Válida até {new Date(status.valida_ate!).toLocaleDateString("pt-BR")}.
                  {status.nova_tentativa_em && ` Nova tentativa a partir de ${new Date(status.nova_tentativa_em).toLocaleDateString("pt-BR")}.`}
                </p>
                <p className="text-xs text-muted-foreground">Áreas avaliadas: {(status.areas_cobertas ?? []).map(rotuloArea).join(", ")}.</p>
                <Button asChild variant="outline" className="h-11 w-full"><Link to="/candidato">Voltar ao perfil</Link></Button>
              </CardContent></Card>
            ) : (
              <Card><CardContent className="p-5 space-y-3 text-sm">
                <h1 className="text-lg font-semibold">{faltaArea ? "Complemento da avaliação" : "Avaliação Food Service 360"}</h1>
                {faltaArea ? (
                  <p>Para a área <b>{rotuloArea(area!)}</b>, responda mais 2 situações. O resto da sua avaliação continua valendo.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5">
                    <li>12 situações do dia a dia de bares e restaurantes.</li>
                    <li>Uma pergunta por vez, com até {seg} segundos cada.</li>
                    <li>O tempo não recomeça se você atualizar a página ou trocar de aparelho.</li>
                    <li>Se a conexão cair, você continua de onde parou.</li>
                    <li>Não existe nota mínima: o resultado orienta a entrevista e não elimina ninguém.</li>
                  </ul>
                )}
                {!navigator.onLine && <p className="flex items-center gap-2 text-destructive"><WifiOff className="h-4 w-4" /> Você está sem conexão.</p>}
                <Button className="h-11 w-full" disabled={enviando} onClick={iniciar}>
                  {enviando && <Loader2 className="h-4 w-4 animate-spin" />} {faltaArea ? "Responder complemento" : "Começar avaliação"}
                </Button>
              </CardContent></Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
