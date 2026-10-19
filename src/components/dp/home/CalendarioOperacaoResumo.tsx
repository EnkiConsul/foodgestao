import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Moon, Sun, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarioResumoNavigation } from "./calendarioResumoNavigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDpOperacaoPanorama, type DiaPanorama } from "@/hooks/useDpOperacaoPanorama";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { diaEhPico } from "@/lib/dp/calendario-rotina";
import { blocosPorFuncionamento, CATEGORIA_LABEL, mensagemAlerta } from "@/lib/dp/operacao-panorama";

const CalendarioOficial = lazy(() => import("@/pages/dp/DpOperacaoPanorama"));
const UNIDADE_KEY = "operacao_unidade";
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function indicadores(d: DiaPanorama) {
  return [
    { label: "Trabalhando", valor: d.trabalhando, cor: "text-primary" },
    { label: "Folgas", valor: d.contagens.folga_padrao + d.contagens.folga_extra, cor: "text-muted-foreground" },
    { label: "Férias", valor: d.contagens.ferias, cor: "text-primary" },
    { label: "Atestados", valor: d.contagens.atestado, cor: "text-warning" },
    { label: "Faltas", valor: d.contagens.ausente, cor: "text-destructive" },
    { label: "Aguardando", valor: d.aguardando, cor: "text-warning" },
  ].filter((i) => i.valor > 0 || i.label === "Trabalhando");
}

/** Pessoas e navegação compactas; decisões abertas no próprio controlador oficial. */
export function CalendarioOperacaoResumo() {
  const hoje = hojeIsoLocal();
  const [{ competencia, aba, selecionado }, navegar] = useReducer(calendarioResumoNavigation, {
    competencia: hoje.slice(0, 7), aba: "hoje", selecionado: hoje,
  });
  const [unidade, setUnidade] = useState("");
  const [detalhe, setDetalhe] = useState<{ data: string; unidadeId: string } | null>(null);
  const [expandidos, setExpandidos] = useState<string[]>([]);
  const { prefs, save } = useDpUserPrefs();
  const qc = useQueryClient();
  const p = useDpOperacaoPanorama(competencia, unidade || null);

  useEffect(() => {
    if (unidade && p.unidades.some((u) => u.id === unidade)) return;
    if (!p.unidades.length) return;
    const salva = (prefs.extras as Record<string, unknown>)?.[UNIDADE_KEY];
    if (typeof salva === "string" && p.unidades.some((u) => u.id === salva)) { setUnidade(salva); return; }
    const maior = [...p.unidades].sort((a, b) => (p.contagemPorUnidade.get(b.id) ?? 0) - (p.contagemPorUnidade.get(a.id) ?? 0))[0];
    setUnidade(maior?.id ?? "");
  }, [unidade, p.unidades, p.contagemPorUnidade, prefs.extras]);
  useEffect(() => setExpandidos([]), [selecionado, unidade]);

  const dia = selecionado.slice(0, 7) === competencia ? p.diaDe(selecionado) : null;
  const blocos = useMemo(() => dia ? blocosPorFuncionamento({
    data: selecionado,
    pessoas: dia.pessoas.filter((pessoa) => ["fixo", "convocado_aceito", "convocado_pendente"].includes(pessoa.categoria)),
    funcionamentoPorUnidade: p.funcionamentoPorUnidade,
    unidades: p.unidades, unidadeId: unidade, agrupar: p.usaSetores ? "setor" : "cargo",
  }) : [], [dia, selecionado, p.funcionamentoPorUnidade, p.unidades, p.usaSetores, unidade]);
  const ausentes = (dia?.pessoas ?? []).filter((pessoa) => !["fixo", "convocado_aceito", "convocado_pendente"].includes(pessoa.categoria));
  const rotuloMes = new Date(`${competencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const rotuloDia = new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const abrirDia = (data: string) => { if (unidade) setDetalhe({ data, unidadeId: unidade }); };
  const alternar = (key: string) => setExpandidos((valores) => valores.includes(key) ? valores.filter((v) => v !== key) : [...valores, key]);

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-3" role="region" aria-label="Calendário do início">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-sm font-semibold">Calendário</h2>
          <Tabs value={aba} onValueChange={(value) => {
            if (value === "hoje" || value === "mes") navegar({ type: "aba", aba: value });
          }} className="ml-auto">
            <TabsList className="h-11 p-1" aria-label="Visualização do calendário">
              <TabsTrigger value="hoje" className="min-h-9 px-3 text-xs">Hoje</TabsTrigger>
              <TabsTrigger value="mes" className="min-h-9 px-3 text-xs">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Abrir calendário completo">
            <Link to="/dp/rotina/calendario"><ExternalLink className="h-4 w-4" /></Link>
          </Button>
        </div>
        {p.unidades.length > 1 && <Select value={unidade} onValueChange={(v) => {
          setUnidade(v); save({ extras: { ...(prefs.extras ?? {}), [UNIDADE_KEY]: v } });
        }}>
          <SelectTrigger className="mt-2 h-11" aria-label="Unidade do calendário"><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>{p.unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
        </Select>}

        {p.error ? <div className="space-y-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar o calendário.</p>
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["dp_panorama_base"] })}>Tentar novamente</Button>
        </div> : p.isLoading ? <div className="mt-3 h-40 animate-pulse rounded-lg bg-muted" aria-label="Carregando calendário" />
          : !p.unidades.length ? <p className="py-4 text-sm text-muted-foreground">Nenhuma unidade disponível para consultar o calendário.</p>
          : !unidade ? <div className="mt-3 h-40 animate-pulse rounded-lg bg-muted" /> : <>
            <div className="my-2 flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => navegar({ type: "avancar", delta: -1 })} aria-label={aba === "mes" ? "Mês anterior" : "Dia anterior"}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-0 flex-1 text-center text-xs font-semibold capitalize" aria-live="polite">{aba === "mes" ? rotuloMes : selecionado === hoje ? `Hoje, ${rotuloDia}` : rotuloDia}</span>
              {(selecionado !== hoje || competencia !== hoje.slice(0, 7)) && <Button variant="ghost" className="h-11 px-2 text-xs" onClick={() => navegar({ type: "hoje", data: hoje })} aria-label="Voltar para hoje">Hoje</Button>}
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => navegar({ type: "avancar", delta: 1 })} aria-label={aba === "mes" ? "Próximo mês" : "Próximo dia"}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            {aba === "mes" ? <>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">{SEMANA.map((s) => <div key={s} className="py-1">{s}</div>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: p.dias[0]?.dow ?? 0 }).map((_, i) => <div key={`v${i}`} />)}
                {p.dias.map((d) => <Button key={d.data} variant="ghost" aria-label={`Selecionar ${d.data}, ${d.trabalhando} trabalhando, ${d.contagens.folga_padrao + d.contagens.folga_extra} folgas`} aria-pressed={d.data === selecionado} aria-current={d.data === hoje ? "date" : undefined}
                  onClick={() => { navegar({ type: "selecionar", data: d.data }); abrirDia(d.data); }}
                  className={cn("relative flex h-16 min-w-0 flex-col gap-1 rounded-md border p-1 text-xs", d.data === selecionado ? "border-primary bg-primary/10 text-primary" : "border-border", diaEhPico(d.data, d.feriado_nome) && "bg-warning/10", d.alerta && "border-destructive/50")}>
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full font-semibold", d.data === hoje && "bg-primary text-primary-foreground")}>{Number(d.data.slice(8))}</span>
                  <span className="flex items-center gap-1 text-[10px] text-primary"><Users className="h-3 w-3" />{d.trabalhando}</span>
                  <span className="flex items-center gap-1">
                    {(d.contagens.folga_padrao + d.contagens.folga_extra > 0) && <span className="h-1 w-1 rounded-full bg-muted-foreground" />}
                    {d.contagens.atestado > 0 && <span className="h-1 w-1 rounded-full bg-warning" />}
                    {d.contagens.ferias > 0 && <span className="h-1 w-1 rounded-full bg-primary" />}
                    {d.alerta && <span className="h-1 w-1 rounded-full bg-destructive" />}
                  </span>
                  {d.feriado_nome && <span className="absolute right-0.5 top-0.5 text-[9px]" title={d.feriado_nome}>🎉</span>}
                </Button>)}
              </div>
              {dia && <Button variant="outline" className="mt-3 min-h-11 w-full justify-between text-xs" onClick={() => abrirDia(selecionado)}>
                <span className="min-w-0 truncate capitalize">{rotuloDia} · {dia.trabalhando} trabalhando</span><ChevronRight className="h-4 w-4 shrink-0" />
              </Button>}
            </> : dia ? <div className="space-y-3">
              <div className="flex flex-wrap gap-x-3 gap-y-1 border-b pb-3">{indicadores(dia).map((i) => <span key={i.label} className={cn("text-xs", i.cor)}><strong className="tabular-nums">{i.valor}</strong> {i.label}</span>)}</div>
              {dia.feriado_nome && <p className="text-xs text-warning">🎉 {dia.feriado_nome}</p>}
              {dia.alerta && <Button variant="ghost" className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal bg-destructive/10 px-2 text-left text-xs text-destructive" onClick={() => abrirDia(selecionado)}><AlertTriangle className="h-4 w-4 shrink-0" />{mensagemAlerta(dia, dia.avaliacao, p.unidades.find((u) => u.id === unidade)?.nome ?? null)}</Button>}
              {blocos.map((bloco) => {
                const expandido = expandidos.includes(bloco.key);
                const Noite = Number((bloco.horario ?? "").slice(0, 2)) >= 15;
                const Icon = Noite ? Moon : Sun;
                return <section key={bloco.key} className="min-w-0">
                  <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-2 bg-muted/50 px-2 text-left" aria-expanded={expandido} onClick={() => alternar(bloco.key)}>
                    <Icon className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{bloco.titulo}</span><span className="block text-[11px] font-normal text-muted-foreground">{bloco.horario}</span></span><span className="text-xs tabular-nums">{bloco.pessoas.length}</span><ChevronDown className={cn("h-4 w-4 shrink-0", expandido && "rotate-180")} />
                  </Button>
                  <ul className="divide-y">{(expandido ? bloco.pessoas : bloco.pessoas.slice(0, 3)).map((pessoa, i) => <li key={`${pessoa.colaborador_id}-${i}`}>
                    <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal px-2 py-2 text-left" onClick={() => abrirDia(selecionado)}>
                      <span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium">{pessoa.nome}</span><span className="block text-[11px] font-normal text-muted-foreground">{[pessoa.cargo_nome, pessoa.setor_nome].filter(Boolean).join(" · ")}{pessoa.categoria === "convocado_pendente" ? " · Aguardando resposta" : ""}</span></span>
                      <span className="shrink-0 text-right text-[11px] font-normal text-muted-foreground">{pessoa.entrada ?? "—"}<br />{pessoa.saida ?? "—"}</span><ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </Button>
                  </li>)}</ul>
                  {!expandido && bloco.pessoas.length > 3 && <Button variant="ghost" className="min-h-11 w-full text-xs text-primary" onClick={() => alternar(bloco.key)}>Ver mais {bloco.pessoas.length - 3}</Button>}
                </section>;
              })}
              {!blocos.length && <p className="py-2 text-xs text-muted-foreground">Nenhuma pessoa prevista para trabalhar neste dia.</p>}
              {ausentes.length > 0 && <section className="border-t pt-2">
                <Button variant="ghost" className="min-h-11 w-full justify-between px-2 text-xs" aria-expanded={expandidos.includes("ausentes")} onClick={() => alternar("ausentes")}><span>Folgas e ausências · {ausentes.length}</span><ChevronDown className={cn("h-4 w-4", expandidos.includes("ausentes") && "rotate-180")} /></Button>
                <ul className="divide-y">{(expandidos.includes("ausentes") ? ausentes : ausentes.slice(0, 2)).map((pessoa, i) => <li key={`${pessoa.colaborador_id}-${i}`}><Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal px-2 text-left" onClick={() => abrirDia(selecionado)}><span className="min-w-0 break-words text-xs font-normal">{pessoa.nome}</span><span className={cn("shrink-0 text-[10px] font-medium", ["atestado", "ausente"].includes(pessoa.categoria) ? "text-destructive" : "text-muted-foreground")}>{pessoa.folga_troca ? "Folga por troca" : CATEGORIA_LABEL[pessoa.categoria]}</span></Button></li>)}</ul>
                {!expandidos.includes("ausentes") && ausentes.length > 2 && <Button variant="ghost" className="min-h-11 w-full text-xs text-primary" onClick={() => alternar("ausentes")}>Ver todas as {ausentes.length} ausências</Button>}
              </section>}
              <Button variant="outline" className="min-h-11 w-full gap-2" onClick={() => abrirDia(selecionado)}><CalendarDays className="h-4 w-4" />Gerir dia<ChevronRight className="ml-auto h-4 w-4" /></Button>
            </div> : <p className="py-3 text-xs text-muted-foreground">Sem informações para este dia.</p>}
          </>}
      </Card>
      {detalhe && <Suspense fallback={<p role="status" className="py-2 text-xs text-muted-foreground">Abrindo detalhes do dia…</p>}>
        <CalendarioOficial modo="calendario" detalheInicial={detalhe} onFecharDetalhe={() => setDetalhe(null)} />
      </Suspense>}
    </>
  );
}
