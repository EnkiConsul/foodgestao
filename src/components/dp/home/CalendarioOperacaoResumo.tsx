import { Suspense, useEffect, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BedSingle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FileHeart, Flame, Palmtree, Users, UserX } from "lucide-react";
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
import { ausenciasVisiveis, diaEhPico, folgaEhDominical } from "@/lib/dp/calendario-rotina";
import { mensagemAlerta } from "@/lib/dp/operacao-panorama";

type ControladorOficial = typeof import("@/pages/dp/DpOperacaoPanorama").default;
const CalendarioOficial = lazyWithRetry<Parameters<ControladorOficial>[0], ControladorOficial>(() => import("@/pages/dp/DpOperacaoPanorama"));
const UNIDADE_KEY = "operacao_unidade";
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
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
  const [detalhe, setDetalhe] = useState<{ data: string; unidadeId: string } | null>(null);
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

  useEffect(() => {
    if (unidade && p.unidades.some((u) => u.id === unidade)) return;
    if (!p.unidades.length) return;
    const salva = (prefs.extras as Record<string, unknown>)?.[UNIDADE_KEY];
    if (typeof salva === "string" && p.unidades.some((u) => u.id === salva)) { setUnidade(salva); return; }
    const maior = [...p.unidades].sort((a, b) => (p.contagemPorUnidade.get(b.id) ?? 0) - (p.contagemPorUnidade.get(a.id) ?? 0))[0];
    setUnidade(maior?.id ?? "");
  }, [unidade, p.unidades, p.contagemPorUnidade, prefs.extras]);
  const dia = selecionado.slice(0, 7) === competencia ? p.diaDe(selecionado) : null;
  const rotuloMes = new Date(`${competencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const rotuloDia = new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const abrirDia = (data: string) => { if (unidade) setDetalhe({ data, unidadeId: unidade }); };


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
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-2 text-[10px] text-muted-foreground" aria-label="Legenda do calendário">
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3 text-primary" />Trabalhando</span>
                {AUSENCIAS_MES.map(({ label, Icon, cor }) => <span key={label} className="inline-flex items-center gap-1"><Icon className={cn("h-3 w-3 rounded-sm", cor)} />{label}</span>)}
                <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3 text-warning" />Pico</span>
                <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" />Alerta</span>
              </div>
              <div className="relative isolate">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 grid grid-cols-7 gap-1">
                  {SEMANA.map((s, i) => <div key={s} className={cn("rounded-md", (i === 0 || i >= 5) && "bg-warning/15")} />)}
                </div>
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg"><CalendarioSemanaCabecalho diasDominicais={diasDominicais} compacto /></div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: p.dias[0]?.dow ?? 0 }).map((_, i) => <div key={`v${i}`} aria-hidden="true" />)}
                  {p.dias.map((d) => <Button key={d.data} variant="ghost"
                    title={[d.feriado_nome, d.alerta ? mensagemAlerta(d, d.avaliacao, p.unidades.find((u) => u.id === unidade)?.nome ?? null) : null].filter(Boolean).join(" · ") || undefined}
                    aria-label={`Selecionar ${d.data}, ${d.trabalhando} trabalhando, ${AUSENCIAS_MES.map((a) => `${a.valor(d)} ${a.label.toLowerCase()}`).join(", ")}${diaEhPico(d.data, d.feriado_nome) ? ", dia de pico" : ""}${d.alerta ? ", alerta de equipe" : ""}`}
                    aria-pressed={d.data === selecionado} aria-current={d.data === hoje ? "date" : undefined}
                    onClick={() => { navegar({ type: "selecionar", data: d.data }); abrirDia(d.data); }}
                    className={cn("relative flex h-24 min-w-0 flex-col justify-start gap-1 rounded-md border px-0.5 py-1 text-xs", "border-border bg-card/70", diaEhPico(d.data, d.feriado_nome) && "bg-warning/10", d.data === selecionado && "border-primary ring-1 ring-inset ring-primary", d.alerta && "border-destructive bg-destructive/10 ring-1 ring-inset ring-destructive/60")}>
                    <span className="flex h-6 w-full items-center justify-between gap-0.5 px-0.5">
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-semibold", d.data === hoje && "bg-primary text-primary-foreground")}>{Number(d.data.slice(8))}</span>
                      {d.alerta ? <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" /> : d.feriado_nome ? <span className="text-[10px]">🎉</span> : diaEhPico(d.data) ? <Flame className="h-3 w-3 shrink-0 text-warning" /> : null}
                    </span>
                    <span className="flex items-center justify-center gap-0.5 text-[11px] font-semibold tabular-nums text-primary"><Users className="h-3 w-3 shrink-0" />{d.trabalhando}</span>
                    <span className="grid w-full grid-cols-2 gap-0.5">
                      {AUSENCIAS_MES.filter((a) => a.valor(d) > 0).map(({ label, Icon, cor, valor }) => <span key={label} className={cn("flex min-w-0 items-center justify-center gap-0.5 rounded-sm py-0.5 text-[10px] leading-none tabular-nums", cor)}><Icon className="h-2.5 w-2.5 shrink-0" /><span>{valor(d)}</span></span>)}
                    </span>
                  </Button>)}
                </div>
              </div>
              {dia && <Button variant="outline" className="mt-3 min-h-11 w-full justify-between text-xs" onClick={() => abrirDia(selecionado)}>
                <span className="min-w-0 truncate capitalize">{rotuloDia} · {dia.trabalhando} trabalhando</span><ChevronRight className="h-4 w-4 shrink-0" />
              </Button>}
            </> : <Suspense fallback={<p role="status" className="py-3 text-xs text-muted-foreground">Carregando dia…</p>}>
              <CalendarioOficial key={`${unidade}-${selecionado}`} modo="calendario" detalheInicial={{ data: selecionado, unidadeId: unidade }} inicioEmLinha />
            </Suspense>}
          </>}
      </Card>
      {detalhe && <Suspense fallback={<p role="status" className="py-2 text-xs text-muted-foreground">Abrindo detalhes do dia…</p>}>
        <CalendarioOficial modo="calendario" detalheInicial={detalhe} onFecharDetalhe={() => setDetalhe(null)} />
      </Suspense>}
    </>
  );
}
