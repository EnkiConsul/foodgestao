import { textoFeriadosDia } from "@/lib/dp/feriados-apresentacao";
import { Suspense, useEffect, useMemo, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BedSingle, Cake, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FileHeart, Flame, Moon, Palmtree, Sun, Users, UserX } from "lucide-react";
import { useDpAniversariantes30d } from "@/hooks/useDpAniversariantes30d";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarioResumoNavigation } from "./calendarioResumoNavigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { CalendarioSemanaCabecalho } from "@/components/dp/calendario/CalendarioSemanaCabecalho";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";
import { diasElegiveisDaConfig } from "@/lib/dp/dsr-rules";
import { useDpOperacaoPanorama, type DiaPanorama } from "@/hooks/useDpOperacaoPanorama";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { ausenciasVisiveis, diaEhPico, folgaEhDominical, periodoHabitual, pessoaNoFiltro, tipoAusencia, type PeriodoTurno } from "@/lib/dp/calendario-rotina";
import { mensagemAlerta } from "@/lib/dp/operacao-panorama";

type ControladorOficial = typeof import("@/pages/dp/DpOperacaoPanorama").default;
const CalendarioOficial = lazyWithRetry<Parameters<ControladorOficial>[0], ControladorOficial>(() => import("@/pages/dp/DpOperacaoPanorama"));
const UNIDADE_KEY = "operacao_unidade";
const AUSENCIAS_BASE = [
  { label: "Folgas", Icon: BedSingle, cor: "text-calendar-folga bg-calendar-folga/10", valor: (d: DiaPanorama) => d.contagens.folga_padrao + d.contagens.folga_extra },
  { label: "Férias", Icon: Palmtree, cor: "text-calendar-ferias bg-calendar-ferias/10", valor: (d: DiaPanorama) => d.contagens.ferias },
  { label: "Atestados", Icon: FileHeart, cor: "text-calendar-atestado bg-calendar-atestado/10", valor: (d: DiaPanorama) => d.contagens.atestado },
  { label: "Faltas", Icon: UserX, cor: "text-calendar-falta bg-calendar-falta/10", valor: (d: DiaPanorama) => d.contagens.ausente },
];

/** Pessoas e navegação compactas; decisões abertas no próprio controlador oficial. */
export function CalendarioOperacaoResumo() {
  const hoje = hojeIsoLocal();
  const [{ competencia, aba, selecionado }, navegar] = useReducer(calendarioResumoNavigation, {
    competencia: hoje.slice(0, 7), aba: "hoje", selecionado: hoje,
  });
  const [unidade, setUnidade] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoTurno>("todos");
  const [detalhe, setDetalhe] = useState<{ data: string; unidadeId: string; periodo: PeriodoTurno } | null>(null);
  const { data: aniversariantes = [] } = useDpAniversariantes30d(competencia);
  const aniversariosDoDia = (data: string) => aniversariantes.filter((a) => a.unidadeId === unidade && a.diaMes === `${data.slice(8)}/${data.slice(5, 7)}`);
  const { prefs, save } = useDpUserPrefs();
  const qc = useQueryClient();
  const { config } = useDpConfigDp(unidade || null);
  const diasDominicais = config ? diasElegiveisDaConfig(config) : [0];
  const folgasDominicais = (d: DiaPanorama) => ausenciasVisiveis(d.pessoas, ["folga"]).filter((a) => folgaEhDominical(d.data, diasDominicais, a)).length;
  const AUSENCIAS_MES = [
    { ...AUSENCIAS_BASE[0], valor: (d: DiaPanorama) => ausenciasVisiveis(d.pessoas, ["folga"]).length - folgasDominicais(d) },
    { label: "Dominicais", Icon: BedSingle, cor: "text-calendar-dominical bg-calendar-dominical/15", valor: folgasDominicais },
    ...AUSENCIAS_BASE.slice(1),
  ];
  const p = useDpOperacaoPanorama(competencia, unidade || null);
  const habitual = useMemo(() => periodoHabitual(p.dias), [p.dias]);
  const dias = useMemo(() => p.dias.map((d) => {
    if (periodo === "todos") return d;
    const pessoas = d.pessoas.filter((pessoa) => pessoaNoFiltro(pessoa, { periodo, setores: [] }, habitual));
    const contagens = { ...d.contagens };
    for (const key of Object.keys(contagens) as (keyof typeof contagens)[]) contagens[key] = pessoas.filter((pessoa) => pessoa.categoria === key).length;
    return { ...d, pessoas, contagens, trabalhando: pessoas.filter((pessoa) => !tipoAusencia(pessoa.categoria)).length };
  }), [p.dias, periodo, habitual]);
  useEffect(() => { setPeriodo("todos"); }, [unidade]);

  useEffect(() => {
    if (unidade && p.unidades.some((u) => u.id === unidade)) return;
    if (!p.unidades.length) return;
    const salva = (prefs.extras as Record<string, unknown>)?.[UNIDADE_KEY];
    if (typeof salva === "string" && p.unidades.some((u) => u.id === salva)) { setUnidade(salva); return; }
    const maior = [...p.unidades].sort((a, b) => (p.contagemPorUnidade.get(b.id) ?? 0) - (p.contagemPorUnidade.get(a.id) ?? 0))[0];
    setUnidade(maior?.id ?? "");
  }, [unidade, p.unidades, p.contagemPorUnidade, prefs.extras]);
  const dia = dias.find((d) => d.data === selecionado);
  const diaHoje = p.dias.find((d) => d.data === hoje);
  const rotuloMes = new Date(`${competencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const rotuloDia = new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const abrirDia = (data: string) => { if (unidade) setDetalhe({ data, unidadeId: unidade, periodo }); };


  return (
    <>
      <Card className="min-w-0 overflow-hidden rounded-2xl p-3 sm:p-4" role="region" aria-label="Calendário do início">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:flex sm:flex-wrap">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="min-w-0 text-sm font-semibold">Calendário Operacional</h2>
          <Button asChild variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:order-last sm:ml-auto" aria-label="Abrir calendário completo">
            <Link to="/dp/rotina/calendario"><ExternalLink className="h-4 w-4" /></Link>
          </Button>
          <div className="col-span-3 flex min-w-0 items-center gap-2 sm:contents">
          {p.unidades.length > 1 && <Select value={unidade} onValueChange={(v) => {
            setUnidade(v); save({ extras: { ...(prefs.extras ?? {}), [UNIDADE_KEY]: v } });
          }}>
            <SelectTrigger className="h-11 w-0 min-w-0 flex-1 rounded-full bg-muted/40 px-3 text-xs sm:h-9 sm:w-auto sm:max-w-[240px] sm:flex-none [&>span]:truncate" aria-label="Unidade do calendário"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent className="rounded-xl">{p.unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
          </Select>}
          <Tabs value={aba} onValueChange={(value) => {
            if (value === "hoje" || value === "mes") navegar({ type: "aba", aba: value });
          }} className="ml-auto shrink-0 lg:hidden">
            <TabsList className="h-11 rounded-full p-1" aria-label="Visualização do calendário">
              <TabsTrigger value="hoje" className="min-h-9 rounded-full px-3 text-xs">Hoje</TabsTrigger>
              <TabsTrigger value="mes" className="min-h-9 rounded-full px-3 text-xs">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 items-stretch gap-1.5 sm:gap-2" aria-label="Indicadores do gestor">
          {([
            { label: "Ausências hoje", Icon: UserX, cor: "bg-calendar-falta/10 text-calendar-falta", valor: diaHoje ? diaHoje.contagens.ferias + diaHoje.contagens.atestado + diaHoje.contagens.ausente : null },
            { label: "Folgas hoje", Icon: BedSingle, cor: "bg-calendar-folga/10 text-calendar-folga", valor: diaHoje ? diaHoje.contagens.folga_padrao + diaHoje.contagens.folga_extra : null },
          ]).map(({ label, Icon, cor, valor }) => <button key={label} type="button" disabled={!unidade} onClick={() => abrirDia(hoje)}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border bg-card px-2 py-2 text-left hover:bg-muted/40 sm:px-3" aria-label={`${label}: ${valor ?? 0}`}>
            <span className={cn("hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:flex", cor)}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 text-[11px] font-semibold leading-tight sm:text-xs">{label}</span>
            <span className={cn("flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums", cor)}>{valor ?? "–"}</span>
          </button>)}
        </div>

        {p.error ? <div className="space-y-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar o calendário.</p>
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["dp_panorama_base"] })}>Tentar novamente</Button>
        </div> : p.isLoading ? <div className="mt-3 h-40 animate-pulse rounded-lg bg-muted" aria-label="Carregando calendário" />
          : !p.unidades.length ? <p className="py-4 text-sm text-muted-foreground">Nenhuma unidade disponível para consultar o calendário.</p>
          : !unidade ? <div className="mt-3 h-40 animate-pulse rounded-lg bg-muted" /> : <>
            <div className="mt-3 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start">
            <section className={cn("min-w-0 lg:col-start-2 lg:row-start-1", aba !== "mes" && "hidden lg:block")} aria-label="Mês resumido">
              <div className="mb-2 flex flex-wrap items-center gap-1 rounded-2xl border border-primary/25 bg-primary/10 p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-primary hover:bg-primary/15 hover:text-primary" onClick={() => navegar({ type: "avancar", delta: -1, alvo: "mes" })} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-0 flex-1 text-center text-sm font-bold text-primary first-letter:uppercase" aria-live="polite">{rotuloMes}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-primary hover:bg-primary/15 hover:text-primary" onClick={() => navegar({ type: "avancar", delta: 1, alvo: "mes" })} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
                <div className="inline-flex w-full justify-center gap-0.5 rounded-full border bg-muted/40 p-0.5 sm:ml-auto sm:w-auto" role="group" aria-label="Turno do mês resumido">
                  {(["todos", "dia", "noite"] as PeriodoTurno[]).map((v) => <Button key={v} size="sm" variant={periodo === v ? "secondary" : "ghost"} aria-pressed={periodo === v} onClick={() => setPeriodo(v)} className="h-8 gap-1 rounded-full px-2 text-[11px]">{v === "todos" ? <Users className="h-3 w-3" /> : v === "dia" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}{v === "todos" ? "Todos" : v === "dia" ? "Dia" : "Noite"}</Button>)}
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-2 text-[10px] text-muted-foreground" aria-label="Legenda do calendário">
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3 text-primary" />Trabalhando</span>
                {AUSENCIAS_MES.map(({ label, Icon, cor }) => <span key={label} className="inline-flex items-center gap-1"><Icon className={cn("h-3 w-3 rounded-sm", cor)} />{label}</span>)}
                <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3 text-warning" />Pico</span>
                <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" />Alerta</span>
                <span className="inline-flex items-center gap-1"><Cake className="h-3 w-3 text-primary" />Aniversários</span>
              </div>
              <div className="relative isolate">
                <div className="grid grid-cols-7 overflow-hidden rounded-t-xl"><CalendarioSemanaCabecalho diasDominicais={diasDominicais} compacto /></div>
                <div className="grid grid-cols-7 gap-1 pt-1">
                  {Array.from({ length: p.dias[0]?.dow ?? 0 }).map((_, i) => <div key={`v${i}`} aria-hidden="true" />)}
                  {dias.map((d) => <Button key={d.data} variant="ghost"
                    title={[textoFeriadosDia(d), d.alerta ? mensagemAlerta(d, d.avaliacao, p.unidades.find((u) => u.id === unidade)?.nome ?? null) : null].filter(Boolean).join(" · ") || undefined}
                    aria-label={`Selecionar ${d.data}, ${textoFeriadosDia(d)}, ${d.trabalhando} trabalhando, ${AUSENCIAS_MES.map((a) => `${a.valor(d)} ${a.label.toLowerCase()}`).join(", ")}${diaEhPico(d.data, d.feriado_nome) ? ", dia de pico" : ""}${d.alerta ? ", alerta de equipe" : ""}${aniversariosDoDia(d.data).length ? `, ${aniversariosDoDia(d.data).length} aniversariantes` : ""}`}
                    aria-pressed={d.data === selecionado} aria-current={d.data === hoje ? "date" : undefined}
                    onClick={() => { navegar({ type: "selecionar", data: d.data }); if (window.matchMedia("(max-width: 1023px)").matches) abrirDia(d.data); }}
                    className={cn("relative flex h-[88px] min-w-0 flex-col justify-start gap-0.5 rounded-lg border px-0.5 py-1 text-xs transition-opacity [&_svg]:size-2.5", "border-border bg-card", diaEhPico(d.data, d.feriado_nome) && "bg-calendar-pico", d.data < hoje && d.data !== selecionado && "opacity-45 grayscale-[0.3] hover:opacity-100", d.data === selecionado && "border-primary ring-1 ring-inset ring-primary", d.alerta && "border-destructive ring-1 ring-inset ring-destructive/60")}>
                    <span className="flex h-6 w-full items-center justify-between gap-0.5 px-0.5">
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", d.data === hoje && "bg-primary text-primary-foreground")}>{Number(d.data.slice(8))}</span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-primary" title={`${d.trabalhando} trabalhando`}><Users className="h-2.5 w-2.5" />{d.trabalhando}</span>
                      <span className="absolute bottom-1 right-1">{d.alerta ? <AlertTriangle className="text-destructive" /> : d.feriado_nome ? <span className="text-[10px]" role="img" aria-label={textoFeriadosDia(d)}>🎉</span> : diaEhPico(d.data) ? <Flame className="text-warning" /> : null}</span>
                    </span>
                    <span className="grid w-full grid-cols-2 gap-0.5">
                      {AUSENCIAS_MES.filter((a) => a.valor(d) > 0).map(({ label, Icon, cor, valor }) => <span key={label} className={cn("flex min-w-0 items-center justify-center gap-0.5 rounded-sm py-0.5 text-[10px] leading-none tabular-nums", cor)}><Icon className="h-2.5 w-2.5 shrink-0" /><span>{valor(d)}</span></span>)}
                    </span>
                    {aniversariosDoDia(d.data).length > 0 && <span className="mt-auto inline-flex items-center gap-0.5 text-[10px] text-foreground" title="Aniversários de nascimento e contratação"><Cake className="h-3 w-3 shrink-0 text-primary" />{aniversariosDoDia(d.data).length}</span>}
                  </Button>)}
                </div>
              </div>
              {dia && <Button variant="outline" className="mt-3 min-h-11 w-full justify-between text-xs lg:hidden" onClick={() => abrirDia(selecionado)}>
                <span className="min-w-0 truncate capitalize">{rotuloDia} · {dia.trabalhando} trabalhando</span><ChevronRight className="h-4 w-4 shrink-0" />
              </Button>}
            </section>
            <section className={cn("min-w-0 space-y-2 lg:col-start-1 lg:row-start-1", aba !== "hoje" && "hidden lg:block")} aria-label="Dia resumido">
              {selecionado !== hoje && <Button variant="ghost" className="h-7 rounded-full px-3 text-xs" onClick={() => navegar({ type: "hoje", data: hoje })}>Voltar para hoje</Button>}
              <Suspense fallback={<p role="status" className="py-3 text-xs text-muted-foreground">Carregando dia…</p>}>
              <CalendarioOficial key={`${unidade}-${selecionado}`} modo="calendario" detalheInicial={{ data: selecionado, unidadeId: unidade }} inicioEmLinha inicioCabecalho={<>
                <Button variant="ghost" size="icon" className="h-8 w-6 shrink-0 hover:bg-calendar-header-foreground/10 hover:text-calendar-header-foreground" onClick={() => navegar({ type: "avancar", delta: -1, alvo: "hoje" })} aria-label="Dia anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-0 flex-1 whitespace-normal text-xs font-semibold leading-snug first-letter:uppercase" aria-live="polite">{selecionado === hoje ? `Hoje, ${rotuloDia}` : rotuloDia}</span>
                <Button variant="ghost" size="icon" className="h-8 w-6 shrink-0 hover:bg-calendar-header-foreground/10 hover:text-calendar-header-foreground" onClick={() => navegar({ type: "avancar", delta: 1, alvo: "hoje" })} aria-label="Próximo dia"><ChevronRight className="h-4 w-4" /></Button>
              </>} />
            </Suspense>
            </section>
            </div>
          </>}
      </Card>
      {detalhe && <Suspense fallback={<p role="status" className="py-2 text-xs text-muted-foreground">Abrindo detalhes do dia…</p>}>
        <CalendarioOficial modo="calendario" detalheInicial={detalhe} onFecharDetalhe={() => setDetalhe(null)} />
      </Suspense>}
    </>
  );
}
