import { cn } from "@/lib/utils";
import { tratativaPendente } from "@/lib/dp/ocorrencias";
import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ChevronLeft, ChevronRight, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpFilterField, DpFilters } from "@/components/dp/DpFilters";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { mensagemErro } from "@/lib/dp/mensagemErro";
import { MotivoDialog } from "@/components/dp/MotivoDialog";
import { OcorrenciaCard } from "@/components/dp/ocorrencias/OcorrenciaCard";
import { OcorrenciaConfirmarDialog } from "@/components/dp/ocorrencias/OcorrenciaConfirmarDialog";
import { OcorrenciaFormDialog } from "@/components/dp/ocorrencias/OcorrenciaFormDialog";
import { OcorrenciaTratativaDialog } from "@/components/dp/ocorrencias/OcorrenciaTratativaDialog";
import { AssiduidadeDecisaoDialog } from "@/components/dp/ocorrencias/AssiduidadeDecisaoDialog";
import {
  ANALISE_LABEL,
  ESTADO_LABEL,
  IMPACTO_LABEL,
  TIPOS_ORDEM,
  TIPO_LABEL,
  TRATATIVA_LABEL,
  type OcorrenciaAnalise,
  type OcorrenciaEstado,
  type OcorrenciaImpacto,
  type OcorrenciaTratativa,
} from "@/lib/dp/ocorrencias";
import {
  FILTROS_PADRAO,
  intervaloDe,
  useDpOcorrencias,
  type Ocorrencia,
  type OcorrenciaFiltros,
  type OcorrenciaPeriodo,
} from "@/hooks/useDpOcorrencias";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
import { useDpPessoasApoio } from "@/hooks/useDpPessoasApoio";
import { OcorrenciaCoberturaDialog } from "@/components/dp/ocorrencias/OcorrenciaCoberturaDialog";
import { OcorrenciaHistoricoDialog } from "@/components/dp/ocorrencias/OcorrenciaHistoricoDialog";
import { useDpOcorrenciasIndicadores } from "@/hooks/useDpOcorrenciasIndicadores";
import { useSwipeHorizontal } from "@/hooks/useSwipeHorizontal";
import type { SubstitutoOpcao } from "@/components/dp/ocorrencias/SubstitutoPicker";

const COBERTURAS: { value: string; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sem", label: "Sem cobertura" },
  { value: "proposta", label: "Cobertura proposta" },
  { value: "aprovada", label: "Cobertura aprovada" },
  { value: "realizada", label: "Cobertura realizada" },
];

const PERIODOS: { value: OcorrenciaPeriodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês vigente" },
  { value: "todas", label: "Todas" },
  { value: "personalizado", label: "Personalizado" },
];

export default function DpOcorrencias() {
  const embedded = useDpEmbedded();
  const [searchParams] = useSearchParams();
  const colaboradorParam = searchParams.get("colaborador");
  const dataParam = searchParams.get("data");
  const [filtros, setFiltros] = useState<OcorrenciaFiltros>(
    colaboradorParam || dataParam
      ? {
          ...FILTROS_PADRAO,
          colaboradorId: colaboradorParam ?? "all",
          data: dataParam ?? null,
          periodo: "mes",
          somentePendentes: false,
        }
      : FILTROS_PADRAO,
  );
  const [novaOpen, setNovaOpen] = useState(false);
  const [visao, setVisao] = useState<"dia" | "colaborador">("dia");

  const [confirmar, setConfirmar] = useState<Ocorrencia | null>(null);
  const [tratativa, setTratativa] = useState<Ocorrencia | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [cobrir, setCobrir] = useState<Ocorrencia | null>(null);
  const [historico, setHistorico] = useState<Ocorrencia | null>(null);
  const [decidirPremio, setDecidirPremio] = useState<Ocorrencia | null>(null);
  const intervalo = useMemo(() => {
    if (filtros.data) return { inicio: filtros.data, fim: filtros.data };
    const r = intervaloDe(filtros.periodo, { inicio: filtros.periodoInicio, fim: filtros.periodoFim });
    return { inicio: r.inicio ?? "2000-01-01", fim: r.fim ?? "2099-12-31" };
  }, [filtros.data, filtros.periodo, filtros.periodoInicio, filtros.periodoFim]);
  const textoPeriodo = useMemo(() => {
    const br = (s: string) => s.split("-").reverse().join("/");
    if (filtros.data) return `Dia ${br(filtros.data)}`;
    if (filtros.periodo === "todas") return "Todo o histórico";
    if (filtros.periodo === "hoje") return "Hoje";
    if (filtros.periodo === "semana") return "Nesta semana";
    if (filtros.periodo === "mes") return "Neste mês";
    return `${br(intervalo.inicio)} a ${br(intervalo.fim)}`;
  }, [filtros.data, filtros.periodo, intervalo]);

  const set = <K extends keyof OcorrenciaFiltros>(k: K, v: OcorrenciaFiltros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  const mesDe = (ini: string, fim: string) => {
    const [a, m] = ini.split("-").map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return ini.endsWith("-01") && fim === `${ini.slice(0, 7)}-${String(ultimo).padStart(2, "0")}` ? ini.slice(0, 7) : null;
  };
  const compAtual = filtros.data ? null : mesDe(intervalo.inicio, intervalo.fim);
  const baseMes = compAtual ?? (filtros.data ?? intervalo.inicio).slice(0, 7);
  const irMes = (n: number) => {
    const [a, m] = (filtros.periodo === "todas" ? format(new Date(), "yyyy-MM") : baseMes).split("-").map(Number);
    const d = new Date(a, m - 1 + n, 1);
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setFiltros((f) => ({
      ...f,
      data: null,
      periodo: "personalizado",
      periodoInicio: format(d, "yyyy-MM-dd"),
      periodoFim: format(fim, "yyyy-MM-dd"),
    }));
  };
  const swipeMes = useSwipeHorizontal(() => irMes(1), () => irMes(-1));

  const acoes = useDpOcorrencias(filtros);
  const { data: colaboradores = [] } = useDpColaboradores();
  const { data: unidades = [] } = useDpUnidades();
  const { setores } = useDpSetores(filtros.unidadeId === "all" ? null : filtros.unidadeId);
  const { data: pessoasApoio = [] } = useDpPessoasApoio({ apenasAtivos: true });
  const { indicadores } = useDpOcorrenciasIndicadores({
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    unidadeId: filtros.unidadeId,
  });

  const colaboradoresAtivos = useMemo(
    () => colaboradores.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })),
    [colaboradores],
  );

  // O colaborador vindo do atalho pode estar inativo: garantimos que ele
  // apareça selecionado no filtro mesmo assim.
  const opcoesColaborador = useMemo(() => {
    const alvo = filtros.colaboradorId;
    if (alvo === "all" || colaboradoresAtivos.some((c) => c.id === alvo)) return colaboradoresAtivos;
    const extra = colaboradores.find((c) => c.id === alvo);
    return extra ? [{ id: extra.id, nome: `${extra.nome} (inativo)` }, ...colaboradoresAtivos] : colaboradoresAtivos;
  }, [colaboradoresAtivos, colaboradores, filtros.colaboradorId]);

  const opcoesSubstituto = useMemo<SubstitutoOpcao[]>(
    () => [
      ...pessoasApoio
        .filter((p) => !p.colaborador_id)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          detalhe: p.tipo === "folguista" ? "Folguista" : "Em teste",
          origem: "apoio" as const,
        })),
      ...colaboradoresAtivos.map((c) => ({ id: c.id, nome: c.nome, origem: "colaborador" as const })),
    ],
    [pessoasApoio, colaboradoresAtivos],
  );

  const activeCount = useMemo(() => {
    const chaves: (keyof OcorrenciaFiltros)[] = [
      "colaboradorId",
      "setorId",
      "tipo",
      "estado",
      "analise",
      "impactaAssiduidade",
      "impactaFerias",
      "tratativa",
      "cobertura",
      "assiduidadeDecisao",
    ];
    return (
      chaves.filter((k) => filtros[k] !== "all").length +
      (filtros.periodo !== "mes" ? 1 : 0) +
      (filtros.somentePendentes ? 1 : 0) +
      (filtros.data ? 1 : 0)
    );
  }, [filtros]);


  const renderCard = (o: (typeof acoes.ocorrencias)[number]) => (
              <OcorrenciaCard
                key={o.id}
                ocorrencia={o}
                coberturas={acoes.coberturasPorOcorrencia.get(o.id) ?? []}
                onConfirmar={() => setConfirmar(o)}
                onTratativa={() => setTratativa(o)}
                onAnalisar={() => acoes.analisar.mutate({ id: o.id, status: "analisada" })}
                onCancelar={() => setCancelarId(o.id)}
                onCobrir={() => setCobrir(o)}
                onHistorico={() => setHistorico(o)}
                onDecidirAssiduidade={() => setDecidirPremio(o)}

                onImpacto={(campo, valor) =>
                  acoes.classificar.mutate(
                    campo === "assiduidade"
                      ? { id: o.id, impactaAssiduidade: valor }
                      : { id: o.id, impactaFerias: valor },
                  )
                }
              />
  );
  const porColaborador = (() => {
    const m = new Map<string, { nome: string; linhas: typeof acoes.ocorrencias }>();
    for (const o of acoes.ocorrencias) {
      const g = m.get(o.colaborador_id) ?? { nome: o.colaborador?.nome ?? "Colaborador", linhas: [] };
      g.linhas.push(o);
      m.set(o.colaborador_id, g);
    }
    return [...m.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  })();

  return (
    <DpPage>
      {!embedded && (
        <Helmet>
          <title>Ocorrências — Pessoas 360°</title>
          <meta
            name="description"
            content="Registre faltas, atrasos, saídas antecipadas, atestados e problemas de ponto e acompanhe a decisão do gestor."
          />
        </Helmet>
      )}
      <DpPageHeader
        icon={ClipboardList}
        title="Ocorrências"
        description="O que estava previsto na jornada e o que realmente aconteceu. Não altera o ponto: registra o fato, a justificativa e a decisão."
        actions={
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar ocorrência
          </Button>
        }
      />

      <div {...swipeMes}>
      {(() => {
        const rotulo = compAtual
          ? new Date(`${compAtual}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
          : textoPeriodo;
        return (
          <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/95 px-3 py-2 shadow-sm backdrop-blur md:static md:bg-card">
            <div className="inline-flex min-w-0 flex-1 items-center justify-between rounded-full border bg-background p-0.5 sm:flex-none">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full" aria-label="Mês anterior" onClick={() => irMes(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-0 truncate px-1 text-center text-sm font-bold first-letter:uppercase sm:min-w-[9.5rem]">{rotulo}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full" aria-label="Próximo mês" onClick={() => irMes(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" className="h-8 shrink-0 rounded-full"
              onClick={() => setFiltros((f) => ({ ...f, data: null, periodo: "mes", periodoInicio: null, periodoFim: null }))}>
              Hoje
            </Button>
            <Select value={filtros.unidadeId} onValueChange={(v) => setFiltros((f) => ({ ...f, unidadeId: v, setorId: "all" }))}>
              <SelectTrigger className="h-8 w-full rounded-full sm:w-56" aria-label="Unidade"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      })()}

      {(() => {
        type CardInd = { key: string; emoji: string; label: string; valor: number; detalhe?: string; aplicar: Partial<OcorrenciaFiltros> };
        const cards: CardInd[] = [
          { key: "falta", emoji: "❌", label: "Faltas", valor: indicadores.porTipo.falta ?? 0, aplicar: { tipo: "falta" } },
          { key: "previsao_falta", emoji: "⚠️", label: "Prev. falta", valor: indicadores.porTipo.previsao_falta ?? 0, aplicar: { tipo: "previsao_falta" } },
          {
            key: "atraso",
            emoji: "⏰", label: "Atrasos",
            valor: indicadores.porTipo.atraso ?? 0,
            detalhe: indicadores.atraso_minutos
              ? (() => {
                  const m = indicadores.atraso_minutos;
                  const h = Math.floor(m / 60);
                  return h ? `${h}h${String(m % 60).padStart(2, "0")} somados` : `${m} min somados`;
                })()
              : undefined,
            aplicar: { tipo: "atraso" },
          },
          { key: "previsao_atraso", emoji: "⚠️", label: "Prev. atraso", valor: indicadores.porTipo.previsao_atraso ?? 0, aplicar: { tipo: "previsao_atraso" } },
          { key: "saida_antecipada", emoji: "🚪", label: "Saídas", valor: indicadores.porTipo.saida_antecipada ?? 0, aplicar: { tipo: "saida_antecipada" } },
          { key: "previsao_saida_antecipada", emoji: "⚠️", label: "Prev. saída", valor: indicadores.porTipo.previsao_saida_antecipada ?? 0, aplicar: { tipo: "previsao_saida_antecipada" } },
          { key: "atraso_intervalo", emoji: "⏳", label: "Intervalo", valor: indicadores.porTipo.atraso_intervalo ?? 0, aplicar: { tipo: "atraso_intervalo" } },
          { key: "previsao_atraso_intervalo", emoji: "⚠️", label: "Prev. intervalo", valor: indicadores.porTipo.previsao_atraso_intervalo ?? 0, aplicar: { tipo: "previsao_atraso_intervalo" } },
          { key: "atestado", emoji: "🩺", label: "Atestados", valor: indicadores.porTipo.atestado ?? 0, aplicar: { tipo: "atestado" } },
          { key: "ausencia_justificada", emoji: "📋", label: "Ausências", valor: indicadores.porTipo.ausencia_justificada ?? 0, aplicar: { tipo: "ausencia_justificada" } },
          { key: "esquecimento_marcacao", emoji: "💭", label: "Esqueceu", valor: indicadores.porTipo.esquecimento_marcacao ?? 0, aplicar: { tipo: "esquecimento_marcacao" } },
          { key: "divergencia_jornada", emoji: "⏱️", label: "Erros", valor: indicadores.porTipo.divergencia_jornada ?? 0, aplicar: { tipo: "divergencia_jornada" } },
          {
            key: "cobertas",
            emoji: "🔁", label: "Cobertas",
            valor: indicadores.ausencias_cobertas,
            detalhe: indicadores.ausencias_descobertas ? `${indicadores.ausencias_descobertas} sem cobertura` : undefined,
            aplicar: { cobertura: "aprovada" },
          },
          { key: "pendentes", emoji: "⚖️", label: "A Tratar", valor: indicadores.pendentes, aplicar: { somentePendentes: true } },
        ].filter((c) => Number(c.valor) > 0);
        if (cards.length === 0) return null;
        const ativo = (c: CardInd) =>
          Object.entries(c.aplicar).every(([k, v]) => filtros[k as keyof OcorrenciaFiltros] === v);
        const clicar = (c: CardInd) => {
          if (ativo(c)) {
            setFiltros((f) => ({ ...f, tipo: "all", cobertura: "all", somentePendentes: false }));
          } else {
            setFiltros((f) => ({ ...f, tipo: "all", cobertura: "all", somentePendentes: false, ...c.aplicar }));
          }
        };
        return (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">{textoPeriodo} · toque para filtrar</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {cards.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => clicar(c)}
                  aria-pressed={ativo(c)}
                  className={cn(
                    "flex flex-col items-stretch justify-start rounded-lg border bg-card p-2 text-center shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 sm:p-3",
                    ativo(c) && "border-primary bg-primary/10",
                  )}
                >
                  <p className="flex min-h-[1.5em] items-start justify-center gap-1 truncate text-xs font-semibold leading-tight text-foreground sm:text-sm"><span aria-hidden>{c.emoji}</span><span className="truncate">{c.label}</span></p>
                  <p className="text-base font-bold leading-tight sm:text-lg">{c.valor}</p>
                  {c.detalhe && <p className="truncate text-[10px] text-muted-foreground">{c.detalhe}</p>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {filtros.data && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrando apenas o dia</span>
          <span className="font-medium">{filtros.data.split("-").reverse().join("/")}</span>
          <Button size="sm" variant="ghost" onClick={() => set("data", null)}>
            Ver o período todo
          </Button>
        </div>
      )}

      <DpFilters
        search={{
          value: filtros.busca,
          onChange: (v) => set("busca", v),
          placeholder: "Buscar colaborador...",
        }}
        activeCount={activeCount}
        onClear={() => setFiltros(FILTROS_PADRAO)}
        columns={4}
      >
        <DpFilterField label="Período">
          <div className="flex gap-1.5">
            <Select
              value={filtros.periodo}
              onValueChange={(v) => setFiltros((f) => ({ ...f, periodo: v as OcorrenciaPeriodo, data: null }))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={filtros.periodo === "personalizado" ? "default" : "outline"}
                  size="icon"
                  aria-label="Escolher período no calendário"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  locale={ptBR}
                  selected={{
                    from: new Date(intervalo.inicio + "T00:00:00"),
                    to: new Date(intervalo.fim + "T00:00:00"),
                  }}
                  defaultMonth={new Date(
                    (filtros.periodo === "todas" ? format(new Date(), "yyyy-MM-dd") : intervalo.inicio) + "T00:00:00",
                  )}
                  onSelect={(r) => {
                    if (!r?.from) return;
                    setFiltros((f) => ({
                      ...f,
                      periodo: "personalizado",
                      data: null,
                      periodoInicio: format(r.from!, "yyyy-MM-dd"),
                      periodoFim: format(r.to ?? r.from!, "yyyy-MM-dd"),
                    }));
                  }}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </DpFilterField>

        <DpFilterField label="Colaborador">
          <Select value={filtros.colaboradorId} onValueChange={(v) => set("colaboradorId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {opcoesColaborador.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>


        <DpFilterField label="Setor">
          <Select value={filtros.setorId} onValueChange={(v) => set("setorId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {setores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Tipo">
          <Select value={filtros.tipo} onValueChange={(v) => set("tipo", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {TIPOS_ORDEM.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Estado">
          <Select value={filtros.estado} onValueChange={(v) => set("estado", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(ESTADO_LABEL) as OcorrenciaEstado[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Análise">
          <Select value={filtros.analise} onValueChange={(v) => set("analise", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(ANALISE_LABEL) as OcorrenciaAnalise[]).map((a) => (
                <SelectItem key={a} value={a}>
                  {ANALISE_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Impacto na assiduidade">
          <Select value={filtros.impactaAssiduidade} onValueChange={(v) => set("impactaAssiduidade", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(IMPACTO_LABEL) as OcorrenciaImpacto[]).map((i) => (
                <SelectItem key={i} value={i}>
                  {IMPACTO_LABEL[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Prêmio de assiduidade">
          <Select
            value={filtros.assiduidadeDecisao}
            onValueChange={(v) => set("assiduidadeDecisao", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Aguardando decisão do gestor</SelectItem>
              <SelectItem value="perde">Perdeu o prêmio</SelectItem>
              <SelectItem value="mantem">Prêmio mantido</SelectItem>
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Impacto nas férias">
          <Select value={filtros.impactaFerias} onValueChange={(v) => set("impactaFerias", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(IMPACTO_LABEL) as OcorrenciaImpacto[]).map((i) => (
                <SelectItem key={i} value={i}>
                  {IMPACTO_LABEL[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Tratativa de ponto">
          <Select value={filtros.tratativa} onValueChange={(v) => set("tratativa", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(TRATATIVA_LABEL) as OcorrenciaTratativa[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TRATATIVA_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Cobertura">
          <Select value={filtros.cobertura} onValueChange={(v) => set("cobertura", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COBERTURAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>


        <DpFilterField label="Pendências">
          <div className="flex h-10 items-center gap-2">
            <Switch
              id="pendentes"
              checked={filtros.somentePendentes}
              onCheckedChange={(v) => set("somentePendentes", v)}
            />
            <Label htmlFor="pendentes" className="text-sm font-normal">
              Só o que falta tratar
            </Label>
          </div>
        </DpFilterField>
      </DpFilters>

      <DpContentCard>
        {acoes.loading ? (
          <TableSkeleton rows={5} columns={4} />
        ) : acoes.isError ? (
          <DpErrorState message={mensagemErro(acoes.error)} onRetry={() => void acoes.refetch()} />
        ) : acoes.ocorrencias.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma ocorrência nesse período com os filtros escolhidos.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Ver:</span>
              <Button size="sm" variant={visao === "dia" ? "default" : "outline"} onClick={() => setVisao("dia")}>
                Dia a dia
              </Button>
              <Button size="sm" variant={visao === "colaborador" ? "default" : "outline"} onClick={() => setVisao("colaborador")}>
                Por colaborador
              </Button>
            </div>
            {visao === "dia" ? (
              <div className="space-y-2">{acoes.ocorrencias.map((o) => renderCard(o))}</div>
            ) : (
              porColaborador.map(([id, g]) => {
                const aTratar = g.linhas.filter((o) => tratativaPendente(o)).length;
                return (
                  <details key={id} open={aTratar > 0} className="rounded-xl border border-border">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="font-medium">{g.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.linhas.length} ocorrência(s){aTratar > 0 ? ` · ${aTratar} a tratar no ponto` : " · nada a tratar"}
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-border p-2">
                      {[...g.linhas].sort((a, b) => a.data_operacional.localeCompare(b.data_operacional)).map((o) => renderCard(o))}
                    </div>
                  </details>
                );
              })
            )}
          </div>
        )}
      </DpContentCard>
      </div>

      <OcorrenciaFormDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        colaboradores={colaboradoresAtivos}
        saving={acoes.registrar.isPending}
        onSubmit={(input) =>
          acoes.registrar.mutate(input, { onSuccess: () => setNovaOpen(false) })
        }
      />

      <OcorrenciaConfirmarDialog
        ocorrencia={confirmar}
        onOpenChange={(open) => !open && setConfirmar(null)}
        saving={acoes.confirmar.isPending}
        onConfirm={(input) =>
          confirmar &&
          acoes.confirmar.mutate(
            { id: confirmar.id, ...input },
            { onSuccess: () => setConfirmar(null) },
          )
        }
        onNaoAconteceu={(motivo) =>
          confirmar &&
          acoes.confirmar.mutate(
            { id: confirmar.id, confirmar: false, justificativaFinal: motivo },
            { onSuccess: () => setConfirmar(null) },
          )
        }
      />

      <OcorrenciaTratativaDialog
        ocorrencia={tratativa}
        onOpenChange={(open) => !open && setTratativa(null)}
        saving={acoes.tratar.isPending}
        onSubmit={({ decisao, observacao }) =>
          tratativa &&
          acoes.tratar.mutate(
            {
              id: tratativa.id,
              decisao,
              observacao,
              marcarAnalisada: tratativa.analise_status === "pendente",
            },
            { onSuccess: () => setTratativa(null) },
          )
        }
      />

      <MotivoDialog
        open={!!cancelarId}
        onOpenChange={(open) => !open && setCancelarId(null)}
        title="Cancelar ocorrência"
        description="Cancele apenas quando o registro estiver errado. O histórico do que aconteceu é preservado."
        confirmLabel="Cancelar ocorrência"
        loading={acoes.cancelar.isPending}
        onConfirm={(motivo) =>
          cancelarId &&
          acoes.cancelar.mutate({ id: cancelarId, motivo }, { onSuccess: () => setCancelarId(null) })
        }
      />
      <OcorrenciaCoberturaDialog
        ocorrencia={cobrir}
        coberturas={cobrir ? acoes.coberturasPorOcorrencia.get(cobrir.id) ?? [] : []}
        opcoes={opcoesSubstituto}
        saving={
          acoes.criarCobertura.isPending ||
          acoes.decidirCobertura.isPending ||
          acoes.confirmarCobertura.isPending
        }
        onOpenChange={(open) => !open && setCobrir(null)}
        onCriar={(input) =>
          cobrir && acoes.criarCobertura.mutate({ ocorrenciaId: cobrir.id, ...input })
        }
        onDecidir={(input) => acoes.decidirCobertura.mutate(input)}
        onConfirmar={(id) => acoes.confirmarCobertura.mutate(id)}
      />
      <AssiduidadeDecisaoDialog
        ocorrencia={decidirPremio}
        saving={acoes.decidirAssiduidade.isPending}
        onOpenChange={(open) => !open && setDecidirPremio(null)}
        onDecidir={({ perde, observacao }) =>
          decidirPremio &&
          acoes.decidirAssiduidade.mutate(
            { id: decidirPremio.id, perde, observacao },
            { onSuccess: () => setDecidirPremio(null) },
          )
        }
      />
      <OcorrenciaHistoricoDialog
        ocorrencia={historico}
        onOpenChange={(open) => !open && setHistorico(null)}
      />
    </DpPage>

  );
}
