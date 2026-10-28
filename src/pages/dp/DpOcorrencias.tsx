import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { tratativaPendente, diretrizPonto, DIRETRIZ_LABEL, rotuloTipoOcorrencia, type DiretrizPonto } from "@/lib/dp/ocorrencias";
import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ArrowLeftRight, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Plus, SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { competenciaDe, competenciaDoIntervalo, deslocarMes, hojeSaoPaulo, intervaloAtual, intervaloCompetencia, lerCorte, somarDias } from "@/lib/dp/ocorrenciasPeriodo";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const colaboradorParam = searchParams.get("colaborador");
  const dataParam = searchParams.get("data");
  const entradaContextual = useRef(searchParams.has("id") || !!colaboradorParam || !!dataParam);
  // Corte salvo no navegador: o filtro inicial já nasce no período dele.
  const [corte, setCorteState] = useState<number>(() =>
    lerCorte(typeof window !== "undefined" ? window.localStorage.getItem("dp_ocorrencias_corte") : null),
  );
  const filtrosIniciais = (c: number): OcorrenciaFiltros => {
    if (!c) return FILTROS_PADRAO;
    const i = intervaloAtual(c);
    return { ...FILTROS_PADRAO, periodo: "personalizado", periodoInicio: i.inicio, periodoFim: i.fim };
  };
  const [filtros, setFiltros] = useState<OcorrenciaFiltros>(() =>
    colaboradorParam || dataParam
      ? {
          ...filtrosIniciais(corte),
          colaboradorId: colaboradorParam ?? "all",
          data: dataParam ?? null,
          somentePendentes: false,
        }
      : filtrosIniciais(corte),
  );
  const [novaOpen, setNovaOpen] = useState(false);
  const [visao, setVisao] = useState<"dia" | "colaborador">("dia");
  const [diretriz, setDiretriz] = useState<DiretrizPonto | null>(null);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [modoTratativa, setModoTratativa] = useState<"editar" | "tratar">("tratar");

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
    if (intervalo.inicio === intervalo.fim) return `Dia ${br(intervalo.inicio)}`;
    return `${br(intervalo.inicio)} a ${br(intervalo.fim)}`;
  }, [filtros.data, filtros.periodo, intervalo]);

  const set = <K extends keyof OcorrenciaFiltros>(k: K, v: OcorrenciaFiltros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  const compCorte = filtros.data || !corte ? null : competenciaDoIntervalo(intervalo, corte);
  const compAtual = filtros.data ? null : compCorte ?? competenciaDoIntervalo(intervalo, 0);
  const hojeRef = () => competenciaDe(hojeSaoPaulo(), corte);
  const baseMes = compAtual ?? competenciaDe(filtros.data ?? intervalo.inicio, filtros.data ? corte : 0);
  const aplicarMes = (a: number, m: number, c: number) => {
    const i = intervaloCompetencia(a, m, c);
    setFiltros((f) => ({ ...f, data: null, periodo: "personalizado", periodoInicio: i.inicio, periodoFim: i.fim }));
  };
  // Corte oficial vem da configuração da empresa; o navegador guarda só uma cópia rápida.
  useEffect(() => {
    if (!selectedCompanyId) return;
    let vivo = true;
    supabase.rpc("dp_ocorrencias_corte_obter", { p_company_id: selectedCompanyId }).then(({ data, error }) => {
      if (!vivo || error || data === null || data === undefined) return;
      const c = lerCorte(String(data));
      window.localStorage.setItem("dp_ocorrencias_corte", String(c));
      setCorteState((atual) => {
        if (atual !== c && !entradaContextual.current) setFiltros(filtrosIniciais(c));
        return c;
      });
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);
  const setCorte = (c: number) => {
    const anterior = corte;
    const filtrosAnteriores = filtros;
    setCorteState(c);
    window.localStorage.setItem("dp_ocorrencias_corte", String(c));
    const [a, m] = (filtros.periodo === "todas" ? competenciaDe(hojeSaoPaulo(), c) : baseMes).split("-").map(Number);
    aplicarMes(a, m, c);
    if (!selectedCompanyId) return;
    supabase.rpc("dp_ocorrencias_corte_definir", { p_company_id: selectedCompanyId, p_dia: c }).then(({ error }) => {
      if (!error) return;
      setCorteState(anterior);
      setFiltros((f) => ({
        ...f,
        data: filtrosAnteriores.data,
        periodo: filtrosAnteriores.periodo,
        periodoInicio: filtrosAnteriores.periodoInicio,
        periodoFim: filtrosAnteriores.periodoFim,
      }));
      window.localStorage.setItem("dp_ocorrencias_corte", String(anterior));
      toast.error(
        /SEM_PERMISSAO/.test(error.message)
          ? "Você não tem permissão para alterar o dia de corte da empresa."
          : "Não foi possível salvar o dia de corte. Tente novamente.",
      );
    });
  };
  // Fora de um mês completo (Hoje, Ontem, semana…), as setas partem do mês que contém o período.
  const mesReferencia = compAtual ?? competenciaDe(filtros.data ?? intervalo.fim, corte);
  const irMes = (n: number) => {
    const [a0, m0] = (filtros.periodo === "todas" ? hojeRef() : compAtual ? baseMes : mesReferencia).split("-").map(Number);
    const alvo = compAtual || filtros.periodo === "todas" ? deslocarMes(a0, m0, n) : n === 0 ? { ano: a0, mes: m0 } : deslocarMes(a0, m0, n);
    aplicarMes(alvo.ano, alvo.mes, corte);
  };
  const voltarAoMes = () => {
    const [a, m] = mesReferencia.split("-").map(Number);
    aplicarMes(a, m, corte);
  };
  const [calAberto, setCalAberto] = useState(false);
  const atalhos = (() => {
    const hoje = hojeSaoPaulo();
    const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
    const iniSem = somarDias(hoje, -dow);
    return [
      { key: "hoje", label: "Hoje", inicio: hoje, fim: hoje },
      { key: "ontem", label: "Ontem", inicio: somarDias(hoje, -1), fim: somarDias(hoje, -1) },
      { key: "semana", label: "Esta semana", inicio: iniSem, fim: somarDias(iniSem, 6) },
      { key: "semana_passada", label: "Semana passada", inicio: somarDias(iniSem, -7), fim: somarDias(iniSem, -1) },
      { key: "mes", label: "Mês inteiro", ...intervaloAtual(corte, hoje) },
    ];
  })();
  const atalhoAtivo = filtros.data
    ? null
    : atalhos.find((a) => a.inicio === intervalo.inicio && a.fim === intervalo.fim) ?? null;
  const aplicarAtalho = (a: (typeof atalhos)[number]) => {
    if (a.key === "mes") return voltarAoMes();
    setFiltros((f) => ({ ...f, data: null, periodo: "personalizado", periodoInicio: a.inicio, periodoFim: a.fim }));
  };
  const periodoCurto = !filtros.data && !compAtual && filtros.periodo !== "todas";
  const rotuloBotaoPeriodo = filtros.data
    ? filtros.data.split("-").reverse().slice(0, 2).join("/")
    : compAtual || filtros.periodo === "todas"
      ? "Período"
      : atalhoAtivo?.label ?? "Personalizado";
  const swipeMes = useSwipeHorizontal(() => irMes(1), () => irMes(-1));

  const acoes = useDpOcorrencias(filtros);
  const qc = useQueryClient();
  // Vindo de uma notificação (?id=): filtra o dia/colaborador e abre a tratativa pendente.
  const idParam = searchParams.get("id");
  const [idAlvo, setIdAlvo] = useState<string | null>(idParam);
  useEffect(() => {
    if (!idParam) return;
    setIdAlvo(idParam);
    let vivo = true;
    supabase
      .from("dp_ocorrencias")
      .select("colaborador_id, data_operacional")
      .eq("id", idParam)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo || !data) return;
        setFiltros((f) => ({
          ...f,
          colaboradorId: data.colaborador_id ?? "all",
          data: data.data_operacional,
          somentePendentes: false,
        }));
      });
    return () => { vivo = false; };
  }, [idParam]);
  useEffect(() => {
    if (!idAlvo) return;
    const alvo = acoes.ocorrencias.find((o) => o.id === idAlvo);
    if (!alvo) return;
    setIdAlvo(null);
    if (alvo.tratativa_status === "pendente" && alvo.estado !== "cancelada") { setModoTratativa("tratar"); setTratativa(alvo); }
    setSearchParams((atual) => {
      const proximos = new URLSearchParams(atual);
      proximos.delete("id");
      return proximos;
    }, { replace: true });
  }, [idAlvo, acoes.ocorrencias, setSearchParams]);
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

  const navigate = useNavigate();
  /**
   * Cobertura nova vai para a Mão de Obra Extra (formulário único): já abre
   * como folguista cobrindo a pessoa, com o período inteiro da ausência
   * (dias seguidos do mesmo tipo) e o horário previsto. Coberturas antigas
   * continuam sendo vistas e decididas no diálogo da ocorrência.
   */
  const abrirCobertura = (o: Ocorrencia) => {
    const existentes = (acoes.coberturasPorOcorrencia.get(o.id) ?? []).filter((c) => c.status !== "recusada");
    if (existentes.length) { setCobrir(o); return; }
    const dias = new Set(
      (acoes.ocorrencias ?? [])
        .filter((x) => x.colaborador_id === o.colaborador_id && x.tipo === o.tipo && x.estado !== "cancelada")
        .map((x) => x.data_operacional),
    );
    let fim = o.data_operacional;
    for (;;) {
      const prox = new Date(`${fim}T12:00:00Z`);
      prox.setUTCDate(prox.getUTCDate() + 1);
      const iso = prox.toISOString().slice(0, 10);
      if (!dias.has(iso)) break;
      fim = iso;
    }
    const motivo = o.tipo === "atestado" || o.tipo === "ausencia_justificada" ? "atestado" : o.tipo.includes("falta") ? "falta" : "outro";
    const q = new URLSearchParams({ aba: "dia", data: o.data_operacional, ate: fim, cobrir: o.colaborador_id, motivo });
    if (o.unidade_id) q.set("unidade", o.unidade_id);
    if (o.previsto_entrada) q.set("entrada", o.previsto_entrada.slice(0, 5));
    if (o.previsto_saida) q.set("saida", o.previsto_saida.slice(0, 5));
    navigate(`/dp/escalas/mes?${q.toString()}`);
  };

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
                onLancado={async (v: boolean) => {
                  const { error } = await supabase.rpc("dp_ocorrencia_marcar_lancado", { _id: o.id, _lancado: v });
                  if (error) toast.error("Não foi possível marcar. Tente de novo.");
                  else qc.invalidateQueries({ queryKey: ["dp_ocorrencias"] });
                }}
                key={o.id}
                ocorrencia={o}
                coberturas={acoes.coberturasPorOcorrencia.get(o.id) ?? []}
                onConfirmar={() => setConfirmar(o)}
                onTratativa={() => { setModoTratativa("tratar"); setTratativa(o); }}
                onEditar={() => { setModoTratativa("editar"); setTratativa(o); }}
                onAnalisar={() => acoes.analisar.mutate({ id: o.id, status: "analisada" })}
                onCancelar={() => setCancelarId(o.id)}
                onCobrir={() => abrirCobertura(o)}
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
  const contagemDiretriz = (() => {
    const c: Record<DiretrizPonto, number> = { compensar: 0, abonar: 0, descontar: 0, ajustar: 0, decidir: 0, outro: 0 };
    for (const o of acoes.ocorrencias) { const d = diretrizPonto(o); if (d) c[d]++; }
    return c;
  })();
  const lista = diretriz ? acoes.ocorrencias.filter((o) => diretrizPonto(o) === diretriz) : acoes.ocorrencias;
  const copiarResumo = async () => {
    const linhas: string[] = [`Resumo do ponto — ${textoPeriodo}`];
    for (const d of ["compensar", "abonar", "descontar", "ajustar", "decidir"] as DiretrizPonto[]) {
      const itens = acoes.ocorrencias.filter((o) => diretrizPonto(o) === d)
        .sort((a, b) => (a.colaborador?.nome ?? "").localeCompare(b.colaborador?.nome ?? "") || a.data_operacional.localeCompare(b.data_operacional));
      if (!itens.length) continue;
      linhas.push("", `${DIRETRIZ_LABEL[d].toUpperCase()} (${itens.length})`);
      for (const o of itens) {
        const [, m, dd] = o.data_operacional.split("-");
        linhas.push(`- ${dd}/${m} · ${o.colaborador?.nome ?? "Colaborador"} · ${rotuloTipoOcorrencia(o)}${o.minutos ? ` · ${o.minutos} min` : ""}`);
      }
    }
    try { await navigator.clipboard.writeText(linhas.join("\n")); toast.success("Resumo copiado. Cole no WhatsApp ou e-mail."); }
    catch { toast.error("Não foi possível copiar. Tente de novo."); }
  };
  const porColaborador = (() => {
    const m = new Map<string, { nome: string; linhas: typeof acoes.ocorrencias }>();
    for (const o of lista) {
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
        
        actions={
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar ocorrência
          </Button>
        }
      />

      <div {...swipeMes}>
      {(() => {
        const nomeMes = new Date(`${mesReferencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        const br = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}`;
        const mesInteiroAtivo = !!compAtual;
        return (
          <div className="flex flex-wrap items-center gap-2 py-2">
            <div className="flex w-full min-w-0 items-center justify-between rounded-full border bg-background p-0.5 sm:w-auto">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label="Mês anterior" onClick={() => irMes(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={voltarAoMes}
                aria-pressed={mesInteiroAtivo}
                aria-label={`Ver ${nomeMes} inteiro`}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center rounded-full px-3 py-0.5 leading-tight transition-colors sm:min-w-[10rem]",
                  mesInteiroAtivo ? "text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="text-sm font-bold first-letter:uppercase">{nomeMes}</span>
                {mesInteiroAtivo && compCorte && (
                  <span className="text-[11px] text-muted-foreground">{br(intervalo.inicio)} a {br(intervalo.fim)}</span>
                )}
                {!mesInteiroAtivo && filtros.periodo !== "todas" && (
                  <span className="text-[11px] text-primary">Toque para ver o mês todo</span>
                )}
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label="Próximo mês" onClick={() => irMes(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant={periodoCurto || filtros.data ? "default" : "outline"} className="h-8 shrink-0 gap-1 rounded-full">
                  {rotuloBotaoPeriodo}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {atalhos.map((a) => {
                  const ativo = a.key === "mes" ? mesInteiroAtivo : atalhoAtivo?.key === a.key;
                  return (
                    <DropdownMenuItem key={a.key} onSelect={() => aplicarAtalho(a)} className="justify-between">
                      {a.label}
                      {ativo && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCalAberto(true)} className="justify-between">
                  Personalizado…
                  {periodoCurto && !atalhoAtivo && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={calAberto} onOpenChange={setCalAberto}>
              <DialogContent className="w-auto max-w-[calc(100vw-2rem)]">
                <DialogHeader><DialogTitle>Escolher período</DialogTitle></DialogHeader>
                <Calendar
                  mode="range"
                  locale={ptBR}
                  selected={{ from: new Date(intervalo.inicio + "T00:00:00"), to: new Date(intervalo.fim + "T00:00:00") }}
                  defaultMonth={new Date((filtros.periodo === "todas" ? hojeSaoPaulo() : intervalo.inicio) + "T00:00:00")}
                  onSelect={(r) => {
                    if (!r?.from) return;
                    setFiltros((f) => ({
                      ...f, periodo: "personalizado", data: null,
                      periodoInicio: format(r.from, "yyyy-MM-dd"),
                      periodoFim: format(r.to ?? r.from, "yyyy-MM-dd"),
                    }));
                  }}
                  className="pointer-events-auto mx-auto p-0"
                />
                <Button onClick={() => setCalAberto(false)}>Aplicar</Button>
              </DialogContent>
            </Dialog>
            <div className="hidden md:contents"><Select value={String(corte)} onValueChange={(v) => setCorte(Number(v))}>
              <SelectTrigger className="h-8 w-auto shrink-0 rounded-full text-xs" aria-label="Período de apuração">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Mês civil (1 ao último dia)</SelectItem>
                {Array.from({ length: 27 }, (_, i) => i + 2).map((c) => (
                  <SelectItem key={c} value={String(c)}>Corte da folha: {c} a {c - 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtros.unidadeId} onValueChange={(v) => setFiltros((f) => ({ ...f, unidadeId: v, setorId: "all" }))}>
              <SelectTrigger className="h-8 w-full rounded-full sm:w-56" aria-label="Unidade"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            </div>
          </div>
        );
      })()}

      {(filtros.colaboradorId !== "all" || filtros.data) && (
        <div className="my-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5 text-xs">
          {filtros.colaboradorId !== "all" && (
            <>
              <span>Lista mostrando só <strong>{colaboradores.find((p) => p.id === filtros.colaboradorId)?.nome ?? "colaborador selecionado"}</strong></span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setFiltros((f) => ({ ...f, colaboradorId: "all" }))}>Ver todos ✕</Button>
            </>
          )}
          {filtros.data && (
            <>
              <span>{textoPeriodo}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={voltarAoMes}>Ver mês completo</Button>
            </>
          )}
        </div>
      )}
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
        // Os cards contam a unidade inteira; ao filtrar por eles, solta o colaborador para a lista bater com o número.
        const clicar = (c: CardInd) => {
          if (ativo(c)) {
            setFiltros((f) => ({ ...f, tipo: "all", cobertura: "all", somentePendentes: false }));
          } else {
            setFiltros((f) => ({ ...filtrosIniciais(corte), periodo: f.periodo, periodoInicio: f.periodoInicio, periodoFim: f.periodoFim, data: f.data, unidadeId: f.unidadeId, ...c.aplicar }));
          }
        };
        return (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Totais da unidade">
              {cards.sort((a, b) => Number(b.key === "pendentes") - Number(a.key === "pendentes")).map((c) => (
                <Button key={c.key} variant={ativo(c) ? "default" : "outline"} onClick={() => { clicar(c); setDiretriz(null); }} aria-pressed={ativo(c)} title={c.detalhe} className="min-h-11 shrink-0 gap-2 px-3">
                  <span aria-hidden>{c.emoji}</span> {c.label} <span className="font-bold tabular-nums">{c.valor}</span>
                </Button>
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

      <div className="hidden md:flex justify-end py-2"><Button variant="outline" onClick={() => setFiltrosAbertos((v) => !v)}><SlidersHorizontal className="mr-2 h-4 w-4" />Filtros{activeCount ? ` (${activeCount})` : ""}</Button></div>
      <div className={cn(!filtrosAbertos && "md:hidden")}><DpFilters
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
                      periodoInicio: format(r.from, "yyyy-MM-dd"),
                      periodoFim: format(r.to ?? r.from, "yyyy-MM-dd"),
                    }));
                  }}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </DpFilterField>

        <DpFilterField label=" " className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setMaisFiltros((v) => !v)}
          >
            {maisFiltros ? "Menos filtros" : "Mais filtros"}
          </Button>
        </DpFilterField>

        <DpFilterField label=" " className="flex items-end">
          <Button
            size="sm"
            variant={filtros.tipo === "folgas_trocas" ? "default" : "outline"}
            className="h-10 w-full gap-2"
            aria-pressed={filtros.tipo === "folgas_trocas"}
            onClick={() => {
              set("tipo", filtros.tipo === "folgas_trocas" ? "all" : "folgas_trocas");
              setDiretriz(null);
            }}
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0" />
            Folgas e trocas
          </Button>
        </DpFilterField>

        {maisFiltros && (
        <>
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
              <SelectItem value="folgas_trocas">Folgas e trocas</SelectItem>
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
        </>
        )}
        <DpFilterField label="Unidade"><Select value={filtros.unidadeId} onValueChange={(v) => setFiltros((f) => ({ ...f, unidadeId: v, setorId: "all" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem>{unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent></Select></DpFilterField>
        <DpFilterField label="Período de apuração"><Select value={String(corte)} onValueChange={(v) => setCorte(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Mês civil</SelectItem>{Array.from({ length: 27 }, (_, i) => i + 2).map((c) => <SelectItem key={c} value={String(c)}>Corte: {c} a {c - 1}</SelectItem>)}</SelectContent></Select></DpFilterField>
      </DpFilters></div>

      <section className="py-3">
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
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["decidir", "compensar", "abonar", "descontar", "ajustar"] as DiretrizPonto[]).filter((d) => contagemDiretriz[d] > 0).map((d) => (
                <Button key={d} variant={diretriz === d ? "default" : "outline"} className="min-h-11 shrink-0 gap-2" onClick={() => setDiretriz((v) => v === d ? null : d)} aria-pressed={diretriz === d}>{DIRETRIZ_LABEL[d]} <span className="font-semibold tabular-nums">{contagemDiretriz[d]}</span></Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Ver:</span>
              <Button size="sm" variant={visao === "dia" ? "default" : "outline"} onClick={() => setVisao("dia")}>
                Dia a dia
              </Button>
              <Button size="sm" variant={visao === "colaborador" ? "default" : "outline"} onClick={() => setVisao("colaborador")}>
                Por colaborador
              </Button>
              {diretriz && (
                <Button size="sm" variant="ghost" onClick={() => setDiretriz(null)}>
                  Mostrar todas
                </Button>
              )}
              <Button size="sm" variant="outline" className="sm:ml-auto" onClick={() => void copiarResumo()}>
                Copiar resumo do ponto
              </Button>
            </div>
            {visao === "dia" ? (
              <div className="space-y-4">{lista.map((o) => renderCard(o))}</div>
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
      </section>
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
        modo={modoTratativa}
        onOpenChange={(open) => !open && setTratativa(null)}
        saving={acoes.tratar.isPending || acoes.ajustarHorario.isPending}
        onAjustarHorario={({ horario, observacao, marcacaoAlvo }) =>
          tratativa &&
          acoes.ajustarHorario.mutate(
            { id: tratativa.id, horario, observacao, marcacaoAlvo, horarioAnterior: tratativa.horario_real, marcacaoAnterior: tratativa.marcacao_alvo, concluir: modoTratativa === "tratar" },
            { onSuccess: () => setTratativa(null) },
          )
        }
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
