import { useMemo, useState } from "react";
import { Moon, SlidersHorizontal, Sun, Users, AlertTriangle, X, Lock, CalendarHeart, Palmtree, Stethoscope, UserX, Repeat, CalendarOff, PartyPopper, Coffee } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";
import { diasElegiveisDaConfig } from "@/lib/dp/dsr-rules";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DiasEmLista } from "@/components/dp/DiasEmLista";
import { cn } from "@/lib/utils";
import {
  ausenciasVisiveis, folgaEhDominical, periodoDoHorario, periodoHabitual, pessoaNoFiltro, primeiroNome, tipoAusencia,
  TIPO_AUSENCIA_LABEL, TIPOS_AUSENCIA, type AusenciaCalendario, type PeriodoTurno, type TipoAusenciaCalendario,
} from "@/lib/dp/calendario-rotina";
import type { DiaPanorama } from "@/hooks/useDpOperacaoPanorama";

// Mesmas cores do Calendário de Folgas.
const TOM: Record<TipoAusenciaCalendario, string> = {
  folga: "border-l-[3px] border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  ferias: "border-l-[3px] border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  falta: "border-l-[3px] border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  atestado: "border-l-[3px] border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
  outras: "border-l-[3px] border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200",
};
// Folga no domingo tem peso diferente na operação: dourado.
const TOM_DOMINICAL = "border-l-[3px] border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
const LEGENDA: { label: string; cls: string }[] = [
  { label: "Folga semanal", cls: TOM.folga },
  { label: "Folga dominical", cls: TOM_DOMINICAL },
  { label: "Férias", cls: TOM.ferias },
  { label: "Falta", cls: TOM.falta },
  { label: "Atestado / Licença", cls: TOM.atestado },
  { label: "Demais", cls: TOM.outras },
];

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Dias do mês anterior/seguinte que completam a primeira e a última semana. */
function diasDePreenchimento(dias: DiaPanorama[]) {
  if (!dias.length) return { antes: [] as string[], depois: [] as string[] };
  const ini = new Date(`${dias[0].data}T12:00:00`);
  const fim = new Date(`${dias[dias.length - 1].data}T12:00:00`);
  const antes: string[] = [];
  for (let i = ini.getDay(); i > 0; i--) {
    const d = new Date(ini); d.setDate(ini.getDate() - i); antes.push(isoLocal(d));
  }
  const depois: string[] = [];
  for (let i = 1; i <= 6 - fim.getDay(); i++) {
    const d = new Date(fim); d.setDate(fim.getDate() + i); depois.push(isoLocal(d));
  }
  return { antes, depois };
}

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Props {
  dias: DiaPanorama[];
  selecionado: string;
  filtros: TipoAusenciaCalendario[];
  onFiltros: (f: TipoAusenciaCalendario[]) => void;
  onAbrirDia: (iso: string) => void;
  unidadeId?: string | null;
}

export function CalendarioAusenciasMes({ dias: diasBrutos, selecionado, filtros, onFiltros, onAbrirDia, unidadeId = null }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const { config } = useDpConfigDp(unidadeId);
  // Dias de descanso dominical habilitados na regra da unidade.
  const diasDominicais = useMemo(() => (config ? diasElegiveisDaConfig(config) : [0]), [config]);
  const ehDiaDominical = (iso: string) => diasDominicais.includes(new Date(`${iso}T12:00:00`).getDay());
  const dominical = (a: AusenciaCalendario, iso: string) => a.tipo === "folga" && folgaEhDominical(iso, diasDominicais, a);
  const tomDe = (a: AusenciaCalendario, iso: string) => (dominical(a, iso) ? TOM_DOMINICAL : TOM[a.tipo]);
  const rotulo = (a: AusenciaCalendario, iso: string) =>
    `${a.nome} · ${dominical(a, iso) ? "Folga dominical" : TIPO_AUSENCIA_LABEL[a.tipo]}${a.troca ? " (troca)" : ""}`;

  const ini = diasBrutos[0]?.data, fimMes = diasBrutos[diasBrutos.length - 1]?.data;
  const bloqueiosQuery = useQuery({
    queryKey: ["cal_rotina_bloqueios", selectedCompanyId, unidadeId, ini, fimMes],
    enabled: !!selectedCompanyId && !!ini,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_datas_bloqueadas")
        .select("data, motivo, liberada, unidade_id")
        .eq("company_id", selectedCompanyId!)
        .gte("data", ini!)
        .lte("data", fimMes!);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const b of data ?? []) {
        if (b.liberada) continue;
        if (b.unidade_id && unidadeId && b.unidade_id !== unidadeId) continue;
        m.set(b.data, b.motivo ?? "Data bloqueada");
      }
      return m;
    },
  });
  const bloqueios = bloqueiosQuery.data ?? new Map<string, string>();
  const alternar = (t: TipoAusenciaCalendario) =>
    onFiltros(filtros.includes(t) ? filtros.filter((x) => x !== t) : [...filtros, t]);

  const [periodo, setPeriodo] = useState<PeriodoTurno>("todos");
  const [setores, setSetores] = useState<string[]>([]);

  // Turnos e setores que a unidade realmente tem no mês.
  const { temDia, temNoite, setoresDisp } = useMemo(() => {
    let dia = false, noite = false;
    const s = new Map<string, string>();
    for (const d of diasBrutos) for (const p of d.pessoas) {
      const per = periodoDoHorario(p.entrada);
      if (per === "dia") dia = true; else if (per === "noite") noite = true;
      if (p.setor_id && p.setor_nome) s.set(p.setor_id, p.setor_nome);
    }
    return { temDia: dia, temNoite: noite, setoresDisp: [...s].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")) };
  }, [diasBrutos]);
  const mostraTurno = temDia && temNoite;

  const habitual = useMemo(() => periodoHabitual(diasBrutos), [diasBrutos]);
  const dias = useMemo(() => {
    const f = { periodo: mostraTurno ? periodo : "todos" as PeriodoTurno, setores };
    if (f.periodo === "todos" && !setores.length) return diasBrutos;
    return diasBrutos.map((d) => {
      const pessoas = d.pessoas.filter((p) => pessoaNoFiltro(p, f, habitual));
      return { ...d, pessoas, trabalhando: pessoas.filter((p) => !tipoAusencia(p.categoria)).length };
    });
  }, [diasBrutos, periodo, setores, mostraTurno, habitual]);

  const hoje = isoLocal(new Date());
  const resumoMes = useMemo(() => {
    const r = { trab: 0, semanal: 0, dominical: 0, ferias: 0, falta: 0, atestado: 0, outras: 0, trocas: 0, alertas: 0, feriados: 0, bloqueados: 0 };
    for (const d of dias) {
      r.trab += d.trabalhando;
      if (d.alerta) r.alertas++;
      if (d.feriado_nome) r.feriados++;
      if (bloqueios.has(d.data)) r.bloqueados++;
      for (const a of ausenciasVisiveis(d.pessoas, filtros)) {
        if (a.tipo === "folga") { if (dominical(a, d.data)) r.dominical++; else r.semanal++; if (a.troca) r.trocas++; }
        else r[a.tipo]++;
      }
    }
    return { ...r, media: dias.length ? Math.round(r.trab / dias.length) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, filtros, bloqueios, diasDominicais]);
  const cards = [
    { icon: Users, label: "Média trabalhando/dia", valor: resumoMes.media, tom: "bg-primary text-primary-foreground" },
    { icon: Coffee, label: "Folgas semanais", valor: resumoMes.semanal, tom: "bg-emerald-600 text-white" },
    { icon: CalendarHeart, label: "Folgas dominicais", valor: resumoMes.dominical, tom: "bg-amber-500 text-white" },
    { icon: Repeat, label: "Folgas por troca", valor: resumoMes.trocas, tom: "bg-teal-600 text-white" },
    { icon: Palmtree, label: "Dias de férias", valor: resumoMes.ferias, tom: "bg-sky-600 text-white" },
    { icon: UserX, label: "Faltas", valor: resumoMes.falta, tom: "bg-rose-600 text-white" },
    { icon: Stethoscope, label: "Atestados / licenças", valor: resumoMes.atestado, tom: "bg-violet-600 text-white" },
    { icon: CalendarOff, label: "Demais ausências", valor: resumoMes.outras, tom: "bg-slate-500 text-white" },
    { icon: Lock, label: "Datas bloqueadas", valor: resumoMes.bloqueados, tom: "bg-destructive text-destructive-foreground" },
    { icon: PartyPopper, label: "Feriados", valor: resumoMes.feriados, tom: "bg-primary/80 text-primary-foreground" },
    { icon: AlertTriangle, label: "Dias com alerta", valor: resumoMes.alertas, tom: "bg-destructive text-destructive-foreground" },
  ].filter((c) => c.valor > 0);

  const ausOcultas = TIPOS_AUSENCIA.length - filtros.length;
  const totalAtivos = setores.length + (ausOcultas > 0 ? 1 : 0);
  const nomeSetor = (id: string) => setoresDisp.find(([k]) => k === id)?.[1] ?? "Setor";
  const alternarSetor = (id: string) =>
    setSetores((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const { antes, depois } = diasDePreenchimento(dias);
  // Dias dos meses vizinhos: clicáveis — levam ao mês correspondente e abrem o dia.
  const vazio = (iso: string) => (
    <button
      key={iso}
      type="button"
      onClick={() => onAbrirDia(iso)}
      className="flex min-h-[112px] flex-col bg-muted/10 p-2 text-left text-muted-foreground transition-colors hover:bg-muted/30"
      title="Ir para este dia"
    >
      <span className="text-sm font-semibold opacity-60">{Number(iso.slice(8))}</span>
    </button>
  );

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...setores.map((id) => ({ key: `s-${id}`, label: nomeSetor(id), onRemove: () => alternarSetor(id) })),
    ...(ausOcultas > 0
      ? [{ key: "aus", label: `Ausências: ${filtros.length} de ${TIPOS_AUSENCIA.length}`, onRemove: () => onFiltros([...TIPOS_AUSENCIA]) }]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {mostraTurno && (
          <div className="inline-flex rounded-full border bg-card p-0.5" role="group" aria-label="Turno">
            {(["todos", "dia", "noite"] as PeriodoTurno[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                aria-pressed={periodo === p}
                className={cn(
                  "min-h-8 rounded-full px-3 text-xs font-medium transition-colors",
                  periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {p === "dia" && <Sun className="h-3.5 w-3.5" />}
                  {p === "noite" && <Moon className="h-3.5 w-3.5" />}
                  {p === "todos" ? "Todos" : p === "dia" ? "Dia" : "Noite"}
                </span>
              </button>
            ))}
          </div>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="min-h-8 gap-1.5 rounded-full">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
              {totalAtivos > 0 && <Badge className="h-5 min-w-5 justify-center px-1 text-[11px]">{totalAtivos}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-4">
            {setoresDisp.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Setor</p>
                {setoresDisp.map(([id, nome]) => (
                  <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={setores.includes(id)} onCheckedChange={() => alternarSetor(id)} />
                    {nome}
                  </label>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Ausências mostradas</p>
              {TIPOS_AUSENCIA.map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={filtros.includes(t)} onCheckedChange={() => alternar(t)} />
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TOM[t])}>{TIPO_AUSENCIA_LABEL[t]}</span>
                </label>
              ))}
            </div>
            <Button
              size="sm" variant="ghost" className="w-full"
              onClick={() => { setSetores([]); onFiltros([...TIPOS_AUSENCIA]); }}
            >
              Limpar filtros
            </Button>
          </PopoverContent>
        </Popover>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onRemove}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border bg-muted/50 px-2.5 text-xs"
          >
            <span className="max-w-[10rem] truncate">{c.label}</span>
            <X className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            <span className="sr-only">Remover filtro</span>
          </button>
        ))}
      </div>




      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {cards.map((c) => (
            <div key={c.label} className="flex items-center gap-3 rounded-2xl border bg-gradient-to-br from-card to-primary/5 p-3 shadow-sm">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", c.tom)}><c.icon className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tabular-nums">{c.valor}</p>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {LEGENDA.map((l) => (
          <span key={l.label} className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", l.cls)}>{l.label}</span>
        ))}
        <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"><Repeat className="h-3 w-3" />Troca</span>
        <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive"><Lock className="h-3 w-3" />Bloqueada</span>
      </div>

      {/* Mobile: 1 dia = 1 linha, como no calendário de folgas */}
      <div className="md:hidden">
        <DiasEmLista
          dias={dias.map((d) => {
            const aus = ausenciasVisiveis(d.pessoas, filtros);
            return {
              iso: d.data,
              selecionado: d.data === selecionado,
              tom: d.alerta ? (d.avaliacao.situacao === "abaixo" ? ("critico" as const) : ("atencao" as const)) : undefined,
              desabilitado: false,
              onSelect: () => onAbrirDia(d.data),
              resumo: (
                <span>
                  <span className="font-semibold text-foreground">{d.trabalhando}</span> trabalham
                  {aus.length ? ` · ${aus.length} ausente(s)` : ""}
                </span>
              ),
              chips: (
                <>
                  {d.data === hoje && <Badge className="text-[10px]">Hoje</Badge>}
                  {d.feriado_nome && <Badge variant="outline" className="text-[10px]">Feriado</Badge>}
                  {bloqueios.has(d.data) && <Badge variant="outline" className="gap-1 border-destructive/40 text-[10px] text-destructive"><Lock className="h-3 w-3" />Bloqueada</Badge>}
                  {aus.map((a) => (
                    <span key={`${a.colaborador_id}-${a.tipo}`} title={rotulo(a, d.data)} className={cn("inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", tomDe(a, d.data), d.data < hoje && "opacity-60")}>
                      {a.troca && <Repeat className="h-2.5 w-2.5" />}{primeiroNome(a.nome)}
                    </span>
                  ))}
                </>
              ),
            };
          })}
        />
      </div>

      {/* Desktop: grade mensal com ausentes em cada dia */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm">
          {DOW.map((d) => (
            <div key={d} className={cn("py-2.5 text-center text-[11px] font-bold uppercase tracking-wider", diasDominicais.includes(DOW.indexOf(d)) ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-primary")}>{d}</div>
          ))}
          {antes.map(vazio)}
          {dias.map((d) => {
            const aus = ausenciasVisiveis(d.pessoas, filtros);
            const passado = d.data < hoje;
            const ehHoje = d.data === hoje;
            const bloqueio = bloqueios.get(d.data);
            // Até 4 em linhas; acima disso, várias pessoas por linha.
            const compacto = aus.length > 4;
            const visiveis = aus.slice(0, compacto ? 12 : 4);
            const extra = aus.length - visiveis.length;
            return (
              <button
                key={d.data}
                type="button"
                onClick={() => onAbrirDia(d.data)}
                className={cn(
                  "group flex min-h-[120px] flex-col gap-1.5 bg-card p-2 text-left transition-all hover:z-10 hover:bg-accent/40 hover:shadow-md",
                  ehDiaDominical(d.data) && "bg-amber-500/[0.04]",
                  d.feriado_nome && "bg-primary/[0.06]",
                  bloqueio && "bg-destructive/[0.04]",
                  d.alerta && d.avaliacao.situacao === "abaixo" && "bg-destructive/5",
                  passado && "bg-muted/30 opacity-60 hover:opacity-100",
                  ehHoje && "z-[1] bg-primary/[0.08] shadow-md ring-2 ring-inset ring-primary",
                  d.data === selecionado && !ehHoje && "ring-2 ring-inset ring-primary/60",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold tabular-nums", ehHoje && "bg-primary text-primary-foreground shadow")}>{Number(d.data.slice(8))}</span>
                    {ehHoje && <span className="rounded bg-primary/15 px-1 text-[9px] font-bold uppercase tracking-wider text-primary">Hoje</span>}
                    {bloqueio && <Lock className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Data bloqueada"><title>{bloqueio}</title></Lock>}
                    {d.feriado_nome && (
                      <Badge variant="outline" className="truncate border-transparent bg-primary px-1.5 py-0 text-[10px] text-primary-foreground" title={d.feriado_nome}>
                        Feriado
                      </Badge>
                    )}
                  </div>
                  <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", d.alerta && d.avaliacao.situacao === "abaixo" ? "bg-destructive/15 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")} title="Trabalhando"><Users className="h-3 w-3" />{d.trabalhando}</span>
                </div>
                <div className={cn(compacto ? "flex flex-wrap gap-1" : "flex flex-col gap-1")}>
                  {visiveis.map((a) => (
                    <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("inline-flex min-w-0 items-center gap-0.5 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase", tomDe(a, d.data), compacto && "max-w-full")} title={rotulo(a, d.data)}>
                      {a.troca && <Repeat className="h-2.5 w-2.5 shrink-0" />}<span className="truncate">{primeiroNome(a.nome)}</span>
                    </span>
                  ))}
                </div>
                {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
              </button>
            );
          })}
          {depois.map(vazio)}
        </div>
      </div>
    </div>
  );
}
