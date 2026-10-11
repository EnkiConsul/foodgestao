import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { gerarCalendarioMesPdf, type CelulaPdf } from "@/lib/dp/calendario-mes-pdf";
import { Moon, SlidersHorizontal, Sun, Users, AlertTriangle, X, Lock, CalendarHeart, Palmtree, Stethoscope, UserX, Repeat, CalendarOff, Coffee, Flame, FileDown, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";
import { diasElegiveisDaConfig } from "@/lib/dp/dsr-rules";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDpFolgaLimites } from "@/hooks/useDpFolgaLimites";
import { resolverLimiteFolga, limiteComFolgaFixaDiaUtil } from "@/lib/dp/folga-limites";
import { useBloqueiosParciais } from "@/hooks/useBloqueiosParciais";
import { useBloqueiosEfetivos } from "@/hooks/useBloqueiosEfetivos";
import { useFixosPorDiaSemana } from "@/hooks/useFixosPorDiaSemana";
import { diaEhPico, folgaFixaDoDia } from "@/lib/dp/calendario-rotina";
import { DiasEmLista } from "@/components/dp/DiasEmLista";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ausenciasVisiveis, folgaEhDominical, periodoDoHorario, periodoHabitual, pessoaNoFiltro, primeiroNome, tipoAusencia,
  TIPO_AUSENCIA_LABEL, TIPOS_AUSENCIA, type AusenciaCalendario, type PeriodoTurno, type TipoAusenciaCalendario,
} from "@/lib/dp/calendario-rotina";
import type { DiaPanorama } from "@/hooks/useDpOperacaoPanorama";

// Mesmas cores do Calendário de Folgas.
const TOM: Record<TipoAusenciaCalendario, string> = {
  folga: "border-l-[3px] border-emerald-700 bg-emerald-900/10 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-200",
  ferias: "border-l-[3px] border-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200",
  falta: "border-l-[3px] border-rose-500 bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200",
  atestado: "border-l-[3px] border-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200",
  outras: "border-l-[3px] border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200",
};
// Folga no domingo tem peso diferente na operação: dourado.
const TOM_DOMINICAL = "border-l-[3px] border-amber-600 bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 dark:bg-amber-500/25 dark:text-amber-100";
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

/** "Qui 15/10" — data com a abreviação do dia da semana. */
const fmtDiaSemana = (iso: string) =>
  `${DOW[new Date(`${iso}T12:00:00`).getDay()]} ${iso.slice(8)}/${iso.slice(5, 7)}`;

interface Props {
  dias: DiaPanorama[];
  selecionado: string;
  filtros: TipoAusenciaCalendario[];
  onFiltros: (f: TipoAusenciaCalendario[]) => void;
  onAbrirDia: (iso: string, periodo?: PeriodoTurno) => void;
  unidadeId?: string | null;
  nomeUnidade?: string;
  competenciaLabel?: string;
  /** Dispensa o alerta do dia ("Marcar como OK"). */
  onMarcarOk?: (dia: DiaPanorama) => void;
}

export function CalendarioAusenciasMes({ dias: diasBrutos, selecionado, filtros, onFiltros, onAbrirDia, unidadeId = null, nomeUnidade, competenciaLabel, onMarcarOk }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const { config } = useDpConfigDp(unidadeId);
  // Dias de descanso dominical habilitados na regra da unidade.
  const diasDominicais = useMemo(() => (config ? diasElegiveisDaConfig(config) : [0]), [config]);
  const ehDiaDominical = (iso: string) => diasDominicais.includes(new Date(`${iso}T12:00:00`).getDay());
  const dominical = (a: AusenciaCalendario, iso: string) => a.tipo === "folga" && folgaEhDominical(iso, diasDominicais, a);
  const tomDe = (a: AusenciaCalendario, iso: string) => (dominical(a, iso) ? TOM_DOMINICAL : TOM[a.tipo]);
  const rotulo = (a: AusenciaCalendario, iso: string) =>
    `${a.nome} · ${a.tipo === "folga" ? "Folga" : TIPO_AUSENCIA_LABEL[a.tipo]}${a.troca ? " (troca)" : ""}`;

  const ini = diasBrutos[0]?.data, fimMes = diasBrutos[diasBrutos.length - 1]?.data;
  const bloqueiosQuery = useBloqueiosEfetivos(selectedCompanyId, unidadeId, ini, fimMes);
  const parciaisQuery = useBloqueiosParciais(selectedCompanyId, unidadeId, ini, fimMes);
  const temParcial = (iso: string) => !bloqueios.has(iso) && (parciaisQuery.data?.get(iso)?.length ?? 0) > 0;
  const bloqueios = useMemo(() => {
    const m = new Map<string, string>();
    bloqueiosQuery.data?.forEach((b, iso) => m.set(iso, b.motivo));
    return m;
  }, [bloqueiosQuery.data]);
  // Limite de folgas pelas mesmas regras e tabelas do Calendário de Folgas.
  const { regras: regrasLimite } = useDpFolgaLimites(unidadeId);
  const diaConfigQuery = useQuery({
    queryKey: ["dp_dia_config", selectedCompanyId, ini, fimMes],
    enabled: !!selectedCompanyId && !!ini,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_dia_config").select("data, limite_folgas, unidade_id")
        .eq("company_id", selectedCompanyId!).gte("data", ini!).lte("data", fimMes!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const fixosPorDow = useFixosPorDiaSemana(selectedCompanyId, unidadeId);
  // Dia bloqueado: sem vagas extras, mas as folgas fixas cadastradas no dia da semana
  // continuam valendo — o teto do dia passa a ser a própria quantidade de fixos.
  const limiteDoDia = (iso: string) => {
    if (bloqueios.has(iso)) return fixosPorDow.data?.get(new Date(`${iso}T12:00:00`).getDay()) ?? 0;
    return unidadeId
      ? limiteComFolgaFixaDiaUtil(iso, resolverLimiteFolga({ data: iso, unidadeId, regras: regrasLimite ?? [], diaConfig: diaConfigQuery.data ?? [] }), fixosPorDow.data).limite
      : null;
  };
  // Trocas aprovadas do mês: data_original por colaborador/data nova (para "era Seg 12/10").
  const trocasMesQuery = useQuery({
    queryKey: ["dp_trocas_mes_cal", selectedCompanyId, ini, fimMes],
    enabled: !!selectedCompanyId && !!ini,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select("destino_id, data_original, data_proposta")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "aprovada")
        .gte("data_proposta", ini!)
        .lte("data_proposta", fimMes!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const dataOriginalTroca = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trocasMesQuery.data ?? []) {
      if (t.data_proposta) m.set(`${t.destino_id}:${t.data_proposta}`, t.data_original);
    }
    return m;
  }, [trocasMesQuery.data]);
  const alternar = (t: TipoAusenciaCalendario) =>
    onFiltros(filtros.includes(t) ? filtros.filter((x) => x !== t) : [...filtros, t]);

  const chaveFiltro = `cal_rotina_filtros:${selectedCompanyId ?? ""}:${unidadeId ?? ""}`;
  const lerFiltro = () => {
    try {
      const v = JSON.parse(localStorage.getItem(chaveFiltro) ?? "{}");
      return {
        periodo: (["todos", "dia", "noite"].includes(v.periodo) ? v.periodo : "todos") as PeriodoTurno,
        setores: Array.isArray(v.setores) ? (v.setores as string[]) : [],
      };
    } catch { return { periodo: "todos" as PeriodoTurno, setores: [] as string[] }; }
  };
  const [periodo, setPeriodo] = useState<PeriodoTurno>(() => lerFiltro().periodo);
  const [setores, setSetores] = useState<string[]>(() => lerFiltro().setores);
  useEffect(() => {
    const f = lerFiltro();
    setPeriodo(f.periodo);
    setSetores(f.setores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveFiltro]);
  useEffect(() => {
    try { localStorage.setItem(chaveFiltro, JSON.stringify({ periodo, setores })); } catch { /* sem armazenamento */ }
  }, [chaveFiltro, periodo, setores]);

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
    const quem = new Map<string, Map<string, { id: string; nome: string; datas: string[] }>>();
    const add = (k: string, id: string, nome: string, iso: string) => {
      const m = quem.get(k) ?? new Map(); quem.set(k, m);
      const e = m.get(id) ?? { id, nome, datas: [] }; if (!e.datas.includes(iso)) e.datas.push(iso); m.set(id, e);
    };
    const r = { trab: 0, semanal: 0, dominical: 0, ferias: 0, falta: 0, atestado: 0, outras: 0, trocas: 0, alertas: 0, feriados: 0, bloqueados: 0 };
    for (const d of dias) {
      r.trab += d.trabalhando;
      if (d.alerta) r.alertas++;
      if (d.feriado_nome) { r.feriados++; add("feriados", `f-${d.data}`, `Feriado · ${d.feriado_nome}`, d.data); }
      if (bloqueios.has(d.data)) {
        r.bloqueados++;
        const motivo = bloqueios.get(d.data);
        add("bloqueados", `b-${d.data}`, motivo ? `Bloqueio · ${motivo}` : "Dia bloqueado", d.data);
      }
      for (const a of ausenciasVisiveis(d.pessoas, filtros)) {
        if (a.tipo === "folga") {
          const k = dominical(a, d.data) ? "dominical" : "semanal"; r[k]++; add(k, a.colaborador_id, a.nome, d.data);
          if (a.troca) { r.trocas++; add("trocas", a.colaborador_id, a.nome, d.data); }
        } else { r[a.tipo]++; add(a.tipo, a.colaborador_id, a.nome, d.data); }
      }
    }
    return { ...r, quem, media: dias.length ? Math.round(r.trab / dias.length) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, filtros, bloqueios, diasDominicais]);
  const cards = [
    { icon: Users, chave: "dias_trab", label: "trab./dia", valor: resumoMes.media, tom: "text-primary" },
    { icon: Coffee, chave: "semanal", label: "semanais", valor: resumoMes.semanal, tom: "text-emerald-600 dark:text-emerald-400" },
    { icon: CalendarHeart, chave: "dominical", label: "dominicais", valor: resumoMes.dominical, tom: "text-amber-600 dark:text-amber-400" },
    { icon: Repeat, chave: "trocas", label: "trocas", valor: resumoMes.trocas, tom: "text-teal-600 dark:text-teal-400" },
    { icon: Palmtree, chave: "ferias", label: "férias", valor: resumoMes.ferias, tom: "text-sky-600 dark:text-sky-400" },
    { icon: UserX, chave: "falta", label: "faltas", valor: resumoMes.falta, tom: "text-rose-600 dark:text-rose-400" },
    { icon: Stethoscope, chave: "atestado", label: "atestados", valor: resumoMes.atestado, tom: "text-violet-600 dark:text-violet-400" },
    { icon: CalendarOff, chave: "outras", label: "cobertos", valor: resumoMes.outras, tom: "text-slate-500" },
    { icon: Lock, chave: "bloqueados", label: "bloqueadas", valor: resumoMes.bloqueados, tom: "text-destructive" },
    { emoji: "🎉", chave: "feriados", label: "feriados", valor: resumoMes.feriados, tom: "text-primary" },
    { icon: AlertTriangle, chave: "dias_alerta", label: "com alerta", valor: resumoMes.alertas, tom: "text-destructive" },
  ].filter((c) => c.valor > 0) as { icon?: typeof Users; emoji?: string; label: string; valor: number; tom: string; chave?: string }[];
  const [cardAberto, setCardAberto] = useState<{ chave: string; label: string } | null>(null);
  const [abrindoDia, setAbrindoDia] = useState<string | null>(null);
  useEffect(() => { if (!cardAberto) setAbrindoDia(null); }, [cardAberto]);
  const pessoasCard = cardAberto
    ? [...(resumoMes.quem.get(cardAberto.chave)?.values() ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [];

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

  const pico = diaEhPico;

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
        metricas: cards.map((c) => ({ label: c.label, valor: c.valor })),
        hoje, diasDominicais,
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
      onClick={() => onAbrirDia(iso, mostraTurno ? periodo : "todos")}
      className="flex min-h-[136px] flex-col bg-muted/20 p-2 text-left text-muted-foreground transition-colors hover:bg-muted/40"
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
        <div className="order-last grid w-full min-w-0 grid-cols-3 items-stretch gap-1.5 md:order-none md:ml-2 md:flex md:w-auto md:flex-wrap">
          {cards.map((c) => {
            const Icone = c.icon;
            const conteudo = (
              <>
                <span className="flex items-center gap-1.5">
                  {c.emoji ? (
                    <span aria-hidden="true" className="text-[13px] leading-none">{c.emoji}</span>
                  ) : Icone ? (
                    <Icone className={cn("h-3.5 w-3.5", c.tom)} />
                  ) : null}
                  <span className="font-bold tabular-nums">{c.valor}</span>
                </span>
                <span className="min-w-0 truncate text-center text-[11px] leading-tight text-muted-foreground md:text-left md:text-xs">{c.label}</span>
              </>
            );
            const cls = "flex h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card px-1.5 py-1 text-xs shadow-sm md:h-7 md:w-auto md:shrink-0 md:flex-row md:justify-start md:gap-1.5 md:rounded-full md:px-2.5 md:whitespace-nowrap";
            return c.chave ? (
              <button key={c.label} type="button" onClick={() => setCardAberto({ chave: c.chave!, label: c.label })} className={cn(cls, "transition-colors hover:bg-muted active:bg-muted")} title={`Ver quem: ${c.label}`}>
                {conteudo}
              </button>
            ) : (
              <span key={c.label} className={cls}>{conteudo}</span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={gerarPdf} disabled={gerando || !dias.length}>
            <FileDown className="h-3.5 w-3.5" /> {gerando ? "Gerando…" : <><span className="md:hidden">PDF</span><span className="hidden md:inline">Gerar PDF</span></>}
          </Button>
          <Button size="sm" variant="outline" className="hidden h-8 gap-1.5 rounded-full md:inline-flex" onClick={() => setFoco((f) => !f)} title={foco ? "Sair do modo foco (Esc)" : "Modo foco"}>
            {foco ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {foco ? "Sair" : "Foco"}
          </Button>
        </div>
      </div>

      {legenda.length + resumoMes.trocas + resumoMes.bloqueados > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hidden items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary md:inline-flex"><Users className="h-3 w-3" />Escalados no dia</span>
          {legenda.map((l) => (
            <span key={l.label} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", l.cls)}>{l.label}</span>
          ))}
          <span className="hidden items-center gap-1 rounded border border-primary/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary md:inline-flex"><Flame className="h-3 w-3 fill-amber-500 text-amber-500" />Pico de operação</span>
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
              selecionado: false,
              tom: d.alerta ? (d.avaliacao.situacao === "abaixo" ? ("critico" as const) : ("atencao" as const)) : undefined,
              desabilitado: false,
              dominical: ehDiaDominical(d.data),
              chipsLinhaUnica: true,
              onSelect: () => onAbrirDia(d.data, mostraTurno ? periodo : "todos"),
              icones: d.alerta || pico(d.data, d.feriado_nome) || bloqueios.has(d.data) || temParcial(d.data) || d.feriado_nome ? (
                <>
                  {d.alerta && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Alerta do dia" />}
                  {bloqueios.has(d.data) && <Lock className="h-3.5 w-3.5 text-destructive" aria-label="Folgas bloqueadas" />}
                  {temParcial(d.data) && <Lock className="h-3.5 w-3.5 text-amber-500" aria-label="Bloqueio parcial" />}
                  {pico(d.data, d.feriado_nome) && <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-label="Pico de operação" />}
                  {d.feriado_nome && (
                    <span
                      title={`Feriado · ${d.feriado_nome}`}
                      role="img"
                      aria-label={`Feriado: ${d.feriado_nome}`}
                      className="text-[13px] leading-none"
                    >
                      🎉
                    </span>
                  )}
                </>
              ) : undefined,
              resumo: (
                <span>
                  <span className="font-semibold text-foreground">{d.trabalhando}</span> trabalham
                  {aus.length ? ` · ${aus.length} ausente(s)` : ""}
                </span>
              ),
              chips: (
                <>
                  {aus.slice(0, 3).map((a) => (
                    <span key={`${a.colaborador_id}-${a.tipo}`} title={rotulo(a, d.data)} className={cn("inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", tomDe(a, d.data), d.data < hoje && "opacity-60")}>
                      {a.troca && <Repeat className="h-2.5 w-2.5" />}{primeiroNome(a.nome)}
                    </span>
                  ))}
                  {aus.length > 3 && <span className="shrink-0 self-center text-[10px] font-semibold text-muted-foreground">+{aus.length - 3}</span>}
                </>
              ),
            };
          })}
        />
      </div>

      {/* Desktop: grade mensal com ausentes em cada dia */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-lg ring-1 ring-primary/10">
          {DOW.map((d, i) => {
            const dom = diasDominicais.includes(i);
            const pk = i === 0 || i >= 5;
            return (
              <div key={d} className={cn(
                "flex items-center justify-center gap-1 border-b-2 py-2.5 text-xs font-extrabold uppercase tracking-[0.16em] shadow-sm",
                dom ? "border-primary bg-primary text-primary-foreground" : "border-primary bg-foreground text-background",
              )}>
                {d}{pk && <span title="Pico de operação" className="inline-flex"><Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-label="Pico de operação" /></span>}
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
                    onClick={() => onAbrirDia(d.data, mostraTurno ? periodo : "todos")}
                    className={cn(
                      "group relative flex min-h-[136px] min-w-0 flex-col gap-2 bg-card p-2 text-left transition-all hover:z-10 hover:-translate-y-px hover:shadow-xl",
                      ehDiaDominical(d.data) && "bg-muted/30",
                      d.feriado_nome && "bg-primary/[0.08]",
                      bloqueio && "bg-destructive/[0.06]",
                      d.alerta && "bg-destructive/15 ring-1 ring-inset ring-destructive/50",
                      passado && "opacity-45 saturate-50 hover:opacity-100 hover:saturate-100",
                      ehHoje && "z-[1] bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)),0_8px_24px_-6px_hsl(var(--primary)/0.5)]",
                    )}
                  >
                    <div className={cn(
                      "-mx-2 -mt-2 flex h-9 shrink-0 items-center justify-between gap-1 overflow-hidden border-b-2 border-primary/25 px-2",
                      d.feriado_nome ? "bg-primary/20" : "bg-primary/[0.09]",
                      ehHoje && "bg-primary/30",
                    )}>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-sm font-extrabold tabular-nums", ehHoje && "bg-primary text-primary-foreground shadow-md")}>{Number(d.data.slice(8))}</span>
                        {ehHoje && <span className="rounded bg-primary px-1 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">Hoje</span>}
                        {d.alerta && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Alerta do dia" />}
                        {ehPico && <Flame className="h-4 w-4 shrink-0 fill-amber-500 text-amber-500" aria-label="Pico de operação"><title>Pico de operação</title></Flame>}
                        {bloqueio && <Lock className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Data bloqueada"><title>{bloqueio}</title></Lock>}
                        {temParcial(d.data) && <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Bloqueio parcial"><title>Bloqueio parcial</title></Lock>}
                        {d.feriado_nome && (
                          <span className="truncate rounded bg-primary px-1 text-[9px] font-bold uppercase leading-4 text-primary-foreground" title={d.feriado_nome}>Feriado</span>
                        )}
                      </div>
                      <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums", d.alerta && d.avaliacao.situacao === "abaixo" ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary")} title="Trabalhando"><Users className="h-3 w-3" />{d.trabalhando}</span>
                    </div>
                    <div className={cn("mt-0.5", compacto ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1")}>
                      {visiveis.map((a) => (
                        <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("inline-flex min-w-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase shadow-sm", tomDe(a, d.data))} title={rotulo(a, d.data)}>
                          {a.troca && <Repeat className="h-2.5 w-2.5 shrink-0" />}<span className="truncate">{primeiroNome(a.nome)}</span>
                        </span>
                      ))}
                    </div>
                    {extra > 0 && <span className="text-[10px] font-semibold text-muted-foreground">+{extra}</span>}
                    {(() => {
                      const lim = limiteDoDia(d.data);
                      if (lim == null) return null;
                      // Em dia dominical, quem tem folga fixa nesse dia não ocupa a vaga de escolha.
                      const usadas = aus.filter((a) => a.tipo === "folga" && !(ehDiaDominical(d.data) && folgaFixaDoDia(d.data, a))).length;
                      return (
                        <span className={cn("mt-auto inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", usadas >= lim ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground")} title="Vagas de folga da unidade neste dia">
                          Folgas {usadas}/{lim}
                        </span>
                      );
                    })()}
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
                      <p key={s} className="line-clamp-2">
                        <span className="text-muted-foreground">{s} ({ns.length}):</span>{" "}
                        {ns.slice(0, 6).join(", ")}{ns.length > 6 ? ` +${ns.length - 6}` : ""}
                      </p>
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
      <Dialog open={cardAberto?.chave === "dias_trab" || cardAberto?.chave === "dias_alerta"} onOpenChange={(o) => !o && setCardAberto(null)}>
        <DialogContent className="flex max-h-[85dvh] max-w-md flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{cardAberto?.chave === "dias_alerta" ? "Dias com alerta" : "Trabalhando por dia"}</DialogTitle>
            <DialogDescription>
              {cardAberto?.chave === "dias_alerta" ? "Contingente fora do padrão habitual. Toque no dia para ajustar." : `Média de ${resumoMes.media} por dia. Toque no dia para abrir.`}
            </DialogDescription>
          </DialogHeader>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {dias.filter((d) => cardAberto?.chave !== "dias_alerta" || d.alerta).map((d) => {
              const pad = d.avaliacao.padrao;
              const abaixo = d.alerta && pad != null && d.trabalhando < pad;
              const acima = d.alerta && pad != null && d.trabalhando > pad;
              const ausentes = ausenciasVisiveis(d.pessoas, TIPOS_AUSENCIA).length;
              return (
                <li key={d.data} className="flex items-center gap-2">
                  <button type="button" disabled={abrindoDia === d.data} onClick={() => { setAbrindoDia(d.data); setCardAberto(null); onAbrirDia(d.data, mostraTurno ? periodo : "todos"); }} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 py-2 text-left transition hover:bg-muted active:scale-[0.98] active:bg-primary/10 disabled:opacity-60">
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      {abrindoDia === d.data && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                      {fmtDiaSemana(d.data)}{d.feriado_nome ? " 🎉" : ""}{bloqueios.has(d.data) ? " 🔒" : ""}
                    </span>
                    <span className="flex flex-col items-end text-xs tabular-nums">
                      <span className={cn(abaixo ? "font-semibold text-destructive" : acima ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                        {d.trabalhando} trabalhando
                        {d.alerta && d.avaliacao.padrao != null ? ` (padrão ${d.avaliacao.padrao}) — ${abaixo ? "abaixo" : "acima"} do padrão` : ""}
                      </span>
                      <span className={cn(ausentes > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                        {ausentes} {ausentes === 1 ? "ausente" : "ausentes"}
                      </span>
                    </span>
                  </button>
                  {cardAberto?.chave === "dias_alerta" && onMarcarOk && d.alerta && (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => onMarcarOk(d)}>
                      Marcar como OK
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
      <Dialog open={!!cardAberto && cardAberto.chave !== "dias_trab" && cardAberto.chave !== "dias_alerta"} onOpenChange={(o) => !o && setCardAberto(null)}>
        <DialogContent className="flex max-h-[85dvh] max-w-md flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="first-letter:uppercase">{cardAberto?.label}</DialogTitle>
            <DialogDescription>
              {cardAberto?.chave === "feriados"
                ? `${pessoasCard.length} feriado(s) no mês`
                : cardAberto?.chave === "bloqueados"
                  ? `${pessoasCard.length} dia(s) com bloqueio no mês`
                  : `${pessoasCard.length} colaborador(es) no mês`}
            </DialogDescription>
          </DialogHeader>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {pessoasCard.map((p) => (
              <li key={p.nome + p.datas[0]} className="py-2">
                <p className="text-sm font-semibold">
                  {cardAberto?.chave === "feriados"
                    ? `🎉 ${p.nome.replace(/^Feriado · /, "")}`
                    : p.nome}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.datas.sort().map((iso) => {
                    const base = fmtDiaSemana(iso);
                    let txt = base;
                    if (cardAberto?.chave === "trocas") {
                      const orig = dataOriginalTroca.get(`${p.id}:${iso}`);
                      if (orig) txt = `${base} (era ${fmtDiaSemana(orig)})`;
                    }
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={abrindoDia === iso}
                        onClick={() => { setAbrindoDia(iso); setCardAberto(null); onAbrirDia(iso, mostraTurno ? periodo : "todos"); }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-foreground transition hover:bg-primary/10 hover:border-primary/40 active:scale-95 disabled:opacity-60"
                      >
                        {abrindoDia === iso && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                        {txt}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
