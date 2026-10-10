import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { gerarCalendarioMesPdf, type CelulaPdf } from "@/lib/dp/calendario-mes-pdf";
import { Moon, SlidersHorizontal, Sun, Users, AlertTriangle, X, Lock, CalendarHeart, Palmtree, Stethoscope, UserX, Repeat, CalendarOff, PartyPopper, Coffee, Flame, FileDown, Maximize2, Minimize2 } from "lucide-react";
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
const TOM_DOMINICAL = "border-l-[3px] border-amber-500 bg-amber-200 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200";
const PDF_COR: Record<TipoAusenciaCalendario, [number, number, number]> = {
  folga: [16, 185, 129], ferias: [14, 165, 233], falta: [244, 63, 94], atestado: [139, 92, 246], outras: [100, 116, 139],
};
const PDF_DOMINICAL: [number, number, number] = [245, 158, 11];

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
  nomeUnidade?: string;
  competenciaLabel?: string;
}

export function CalendarioAusenciasMes({ dias: diasBrutos, selecionado, filtros, onFiltros, onAbrirDia, unidadeId = null, nomeUnidade, competenciaLabel }: Props) {
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
    { icon: Users, label: "trab./dia", valor: resumoMes.media, tom: "text-primary" },
    { icon: Coffee, label: "semanais", valor: resumoMes.semanal, tom: "text-emerald-600 dark:text-emerald-400" },
    { icon: CalendarHeart, label: "dominicais", valor: resumoMes.dominical, tom: "text-amber-600 dark:text-amber-400" },
    { icon: Repeat, label: "trocas", valor: resumoMes.trocas, tom: "text-teal-600 dark:text-teal-400" },
    { icon: Palmtree, label: "férias", valor: resumoMes.ferias, tom: "text-sky-600 dark:text-sky-400" },
    { icon: UserX, label: "faltas", valor: resumoMes.falta, tom: "text-rose-600 dark:text-rose-400" },
    { icon: Stethoscope, label: "atestados", valor: resumoMes.atestado, tom: "text-violet-600 dark:text-violet-400" },
    { icon: CalendarOff, label: "cobertos", valor: resumoMes.outras, tom: "text-slate-500" },
    { icon: Lock, label: "bloqueadas", valor: resumoMes.bloqueados, tom: "text-destructive" },
    { icon: PartyPopper, label: "feriados", valor: resumoMes.feriados, tom: "text-primary" },
    { icon: AlertTriangle, label: "com alerta", valor: resumoMes.alertas, tom: "text-destructive" },
  ].filter((c) => c.valor > 0);

  // Legenda só com o que existe no mês.
  const legenda = [
    { label: "Folga semanal", cls: TOM.folga, n: resumoMes.semanal, pdf: PDF_COR.folga },
    { label: "Folga dominical", cls: TOM_DOMINICAL, n: resumoMes.dominical, pdf: PDF_DOMINICAL },
    { label: "Férias", cls: TOM.ferias, n: resumoMes.ferias, pdf: PDF_COR.ferias },
    { label: "Falta", cls: TOM.falta, n: resumoMes.falta, pdf: PDF_COR.falta },
    { label: "Atestado / Licença", cls: TOM.atestado, n: resumoMes.atestado, pdf: PDF_COR.atestado },
    { label: "Coberto por folguista", cls: TOM.outras, n: resumoMes.outras, pdf: PDF_COR.outras },
  ].filter((l) => l.n > 0);

  const ausOcultas = TIPOS_AUSENCIA.length - filtros.length;
  const totalAtivos = setores.length + (ausOcultas > 0 ? 1 : 0);
  const nomeSetor = (id: string) => setoresDisp.find(([k]) => k === id)?.[1] ?? "Setor";
  const alternarSetor = (id: string) =>
    setSetores((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const [foco, setFoco] = useState(false);
  useEffect(() => {
    if (!foco) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFoco(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [foco]);

  const pico = (iso: string, feriado?: string | null) => {
    const dw = new Date(`${iso}T12:00:00`).getDay();
    return dw === 0 || dw >= 5 || !!feriado;
  };

  const { antes, depois } = diasDePreenchimento(dias);

  const [gerando, setGerando] = useState(false);
  const gerarPdf = async () => {
    setGerando(true);
    try {
      const vaz = (iso: string): CelulaPdf => ({ iso, dentroMes: false, trabalhando: 0, ausencias: [] });
      const celulas: CelulaPdf[] = [
        ...antes.map(vaz),
        ...dias.map((d) => ({
          iso: d.data, dentroMes: true, trabalhando: d.trabalhando, feriado: d.feriado_nome,
          bloqueado: bloqueios.has(d.data), pico: pico(d.data, d.feriado_nome), dominical: ehDiaDominical(d.data),
          ausencias: ausenciasVisiveis(d.pessoas, filtros).map((a) => ({
            nome: primeiroNome(a.nome), troca: a.troca, cor: dominical(a, d.data) ? PDF_DOMINICAL : PDF_COR[a.tipo],
          })),
        })),
        ...depois.map(vaz),
      ];
      const bytes = await gerarCalendarioMesPdf({
        titulo: "Calendário do mês", unidade: nomeUnidade ?? "", competencia: competenciaLabel ?? "",
        celulas, legenda: legenda.map((l) => ({ label: l.label, cor: l.pdf })),
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `calendario-${(dias[0]?.data ?? "").slice(0, 7)}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      toast.error("Não foi possível gerar o PDF. Tente novamente em instantes.");
    } finally { setGerando(false); }
  };

  // Dias dos meses vizinhos: clicáveis — levam ao mês correspondente e abrem o dia.
  const vazio = (iso: string) => (
    <button
      key={iso}
      type="button"
      onClick={() => onAbrirDia(iso)}
      className="flex min-h-[112px] flex-col bg-muted/20 p-2 text-left text-muted-foreground transition-colors hover:bg-muted/40"
      title="Ir para este dia"
    >
      <span className="text-sm font-semibold opacity-50">{Number(iso.slice(8))}</span>
    </button>
  );

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...setores.map((id) => ({ key: `s-${id}`, label: nomeSetor(id), onRemove: () => alternarSetor(id) })),
    ...(ausOcultas > 0
      ? [{ key: "aus", label: `Ausências: ${filtros.length} de ${TIPOS_AUSENCIA.length}`, onRemove: () => onFiltros([...TIPOS_AUSENCIA]) }]
      : []),
  ];

  return (
    <div className={cn("space-y-2.5", foco && "fixed inset-0 z-50 overflow-auto bg-background p-4 sm:p-6")}>
      <div className="flex flex-wrap items-center gap-2">
        {foco && <p className="mr-2 text-sm font-bold">{competenciaLabel} · {nomeUnidade}</p>}
        {mostraTurno && (
          <div className="inline-flex rounded-full border bg-card p-0.5" role="group" aria-label="Turno">
            {(["todos", "dia", "noite"] as PeriodoTurno[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                aria-pressed={periodo === p}
                className={cn(
                  "min-h-7 rounded-full px-3 text-xs font-medium transition-colors",
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
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full">
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
            <Button size="sm" variant="ghost" className="w-full" onClick={() => { setSetores([]); onFiltros([...TIPOS_AUSENCIA]); }}>
              Limpar filtros
            </Button>
          </PopoverContent>
        </Popover>
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={c.onRemove} className="inline-flex h-8 items-center gap-1 rounded-full border bg-muted/50 px-2.5 text-xs">
            <span className="max-w-[10rem] truncate">{c.label}</span>
            <X className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            <span className="sr-only">Remover filtro</span>
          </button>
        ))}

        {/* Métricas em linha — só o que tem valor */}
        <div className="flex flex-wrap items-center gap-1.5 md:ml-2">
          {cards.map((c) => (
            <span key={c.label} className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs shadow-sm">
              <c.icon className={cn("h-3.5 w-3.5", c.tom)} />
              <span className="font-bold tabular-nums">{c.valor}</span>
              <span className="text-muted-foreground">{c.label}</span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={gerarPdf} disabled={gerando || !dias.length}>
            <FileDown className="h-3.5 w-3.5" /> {gerando ? "Gerando…" : "Gerar PDF"}
          </Button>
          <Button size="sm" variant="outline" className="hidden h-8 gap-1.5 rounded-full md:inline-flex" onClick={() => setFoco((f) => !f)} title={foco ? "Sair do modo foco (Esc)" : "Modo foco"}>
            {foco ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {foco ? "Sair" : "Foco"}
          </Button>
        </div>
      </div>

      {legenda.length + resumoMes.trocas + resumoMes.bloqueados > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary"><Users className="h-3 w-3" />Escalados no dia</span>
          {legenda.map((l) => (
            <span key={l.label} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", l.cls)}>{l.label}</span>
          ))}
          {resumoMes.trocas > 0 && <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"><Repeat className="h-3 w-3" />Troca</span>}
          {resumoMes.bloqueados > 0 && <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive"><Lock className="h-3 w-3" />Bloqueada</span>}
          <span className="hidden items-center gap-1 rounded border border-orange-400/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-700 dark:text-orange-300 md:inline-flex"><Flame className="h-3 w-3" />Pico de operação</span>
          <span className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">Atalhos: ← → mês · H hoje · Esc fecha</span>
        </div>
      )}

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
                  {pico(d.data, d.feriado_nome) && <Badge variant="outline" className="gap-1 border-orange-400/60 text-[10px] text-orange-700 dark:text-orange-300"><Flame className="h-3 w-3" />Pico</Badge>}
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
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-lg ring-1 ring-primary/10">
          {DOW.map((d, i) => {
            const dom = diasDominicais.includes(i);
            const pk = i === 0 || i >= 5;
            return (
              <div key={d} className={cn(
                "flex items-center justify-center gap-1 border-b-2 py-2.5 text-xs font-extrabold uppercase tracking-[0.16em] shadow-sm",
                dom ? "border-amber-600 bg-amber-400 text-amber-950" : "border-primary bg-foreground text-background",
              )}>
                {d}{pk && <Flame className="h-3 w-3 opacity-80" aria-label="Pico de operação" />}
              </div>
            );
          })}
          {antes.map(vazio)}
          {dias.map((d) => {
            const aus = ausenciasVisiveis(d.pessoas, filtros);
            const passado = d.data < hoje;
            const ehHoje = d.data === hoje;
            const bloqueio = bloqueios.get(d.data);
            const ehPico = pico(d.data, d.feriado_nome);
            const compacto = aus.length >= 4;
            const visiveis = aus.slice(0, compacto ? 12 : 4);
            const extra = aus.length - visiveis.length;
            const trab = d.pessoas.filter((p) => !tipoAusencia(p.categoria));
            const porSetor = new Map<string, string[]>();
            for (const p of trab) {
              const k = p.setor_nome ?? "Sem setor";
              porSetor.set(k, [...(porSetor.get(k) ?? []), primeiroNome(p.nome)]);
            }
            return (
              <HoverCard key={d.data} openDelay={350} closeDelay={80}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onAbrirDia(d.data)}
                    className={cn(
                      "group relative flex min-h-[112px] flex-col gap-1.5 bg-card p-2 text-left transition-all hover:z-10 hover:-translate-y-px hover:shadow-xl",
                      ehDiaDominical(d.data) && "bg-amber-100/70 dark:bg-amber-500/15",
                      d.feriado_nome && "bg-primary/10",
                      bloqueio && "bg-destructive/[0.06]",
                      d.alerta && d.avaliacao.situacao === "abaixo" && "bg-destructive/10",
                      passado && "opacity-45 saturate-50 hover:opacity-100 hover:saturate-100",
                      ehHoje && "z-[1] bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)),0_8px_24px_-6px_hsl(var(--primary)/0.5)]",
                      d.data === selecionado && !ehHoje && "ring-2 ring-inset ring-primary/60",
                    )}
                  >
                    {ehPico && <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-orange-400 to-amber-500" aria-hidden="true" />}
                    <div className={cn(
                      "-mx-2 -mt-2 flex items-center justify-between gap-1 border-b border-border/70 px-2 py-1.5",
                      ehPico ? "bg-orange-500/15" : "bg-muted/70",
                      ehHoje && "bg-primary/15",
                    )}>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm font-extrabold tabular-nums", ehHoje && "bg-primary text-primary-foreground shadow-md")}>{Number(d.data.slice(8))}</span>
                        {ehHoje && <span className="rounded bg-primary px-1 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">Hoje</span>}
                        {bloqueio && <Lock className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Data bloqueada"><title>{bloqueio}</title></Lock>}
                        {d.feriado_nome && (
                          <Badge variant="outline" className="truncate border-transparent bg-primary px-1.5 py-0 text-[10px] text-primary-foreground" title={d.feriado_nome}>Feriado</Badge>
                        )}
                      </div>
                      <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums", d.alerta && d.avaliacao.situacao === "abaixo" ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary")} title="Trabalhando"><Users className="h-3 w-3" />{d.trabalhando}</span>
                    </div>
                    <div className={cn(compacto ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1")}>
                      {visiveis.map((a) => (
                        <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("inline-flex min-w-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase shadow-sm", tomDe(a, d.data))} title={rotulo(a, d.data)}>
                          {a.troca && <Repeat className="h-2.5 w-2.5 shrink-0" />}<span className="truncate">{primeiroNome(a.nome)}</span>
                        </span>
                      ))}
                    </div>
                    {extra > 0 && <span className="text-[10px] font-semibold text-muted-foreground">+{extra}</span>}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent side="top" className="w-64 space-y-2 p-3 text-xs">
                  <p className="font-bold first-letter:uppercase">
                    {new Date(`${d.data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}
                    {d.feriado_nome ? ` · ${d.feriado_nome}` : ""}
                  </p>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">Trabalhando ({trab.length})</p>
                    {trab.length ? [...porSetor].map(([s, ns]) => (
                      <p key={s}><span className="text-muted-foreground">{s}:</span> {ns.join(", ")}</p>
                    )) : <p className="text-muted-foreground">Ninguém escalado.</p>}
                  </div>
                  {aus.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ausentes ({aus.length})</p>
                      <p>{aus.map((a) => rotulo(a, d.data)).join(" · ")}</p>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">Clique para gerenciar o dia.</p>
                </HoverCardContent>
              </HoverCard>
            );
          })}
          {depois.map(vazio)}
        </div>
      </div>
    </div>
  );
}
