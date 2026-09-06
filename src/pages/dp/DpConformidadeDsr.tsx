import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { ScaleIcon, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import {
  avaliarConformidade, DIA_SEMANA_CURTO, rotuloFrequencia,
  tipoDiasDescanso, diasElegiveisDaConfig,
  type ConformidadeInput, type ConformidadeLinha,
} from "@/lib/dp/dsr-rules";

import { primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/dp/competencia";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

import { cn } from "@/lib/utils";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";


/** Lista os dias da semana informados (0=dom, 6=sáb) de um mês 'yyyy-mm', em ISO. */
function diasDaSemanaDoMes(competencia: string, weekday: number): string[] {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m) return [];
  const out: string[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m - 1, d);
    if (date.getDay() === weekday) out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

const competenciaAtual = () => new Date().toISOString().slice(0, 7);

/** Dia da semana (0=dom) de uma data ISO, sem drift de fuso. */
function weekdayIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

/** Formata data ISO para dd/mm sem criar Date com fuso. */
function diaMesIso(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

interface LinhaComUnidade extends ConformidadeInput {
  unidadeId: string | null;
  cargoId: string | null;
  /** Dias da semana de descanso fixo do cadastro (0=dom). */
  dowsDescanso: number[];
  /** Origem de cada folga do mês: registro efetivado ou pedido aprovado. */
  origemPorData: Map<string, "registrada" | "aprovada">;
}

type LinhaConformidade = ConformidadeLinha & Omit<LinhaComUnidade, keyof ConformidadeInput>;

type ColKey = "colaborador" | "unidade" | "cargo" | "folgas" | "situacao";
type SortKey = "padrao" | "nome" | "unidade" | "cargo" | "folgas" | "situacao";

const SITUACAO_OK = "CLT e empresa em ordem";
const SITUACAO_SO_CLT = "Só CLT em falta";
const SITUACAO_SO_EMPRESA = "Só regra da empresa em falta";
const SITUACAO_AMBAS = "CLT e empresa em falta";

/** Rótulo único da situação, usado no filtro da coluna e no CSV. */
function situacaoLabel(l: { conformeClt: boolean; conformeEmpresa: boolean }): string {
  if (l.conformeClt && l.conformeEmpresa) return SITUACAO_OK;
  if (!l.conformeClt && !l.conformeEmpresa) return SITUACAO_AMBAS;
  return l.conformeClt ? SITUACAO_SO_EMPRESA : SITUACAO_SO_CLT;
}

const DEFAULT_ORDER: ColKey[] = ["colaborador", "unidade", "cargo", "folgas", "situacao"];
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  colaborador: 260,
  unidade: 180,
  cargo: 160,
  folgas: 140,
  situacao: 260,
};


export default function DpConformidadeDsr() {
  const embedded = useDpEmbedded();
  const { selectedCompanyId } = useCompanyContext();
  const { config: configPadraoEmpresa, rows } = useDpConfigDp();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [detalhe, setDetalhe] = useState<LinhaConformidade | null>(null);

  const unidadesQuery = useDpUnidades();
  const cargosQuery = useDpCargos();
  const unidadeNome = useMemo(() => {
    const map = new Map<string, string>();
    (unidadesQuery.data ?? []).forEach((u) => map.set(u.id, u.nome));
    return map;
  }, [unidadesQuery.data]);
  const cargoNome = useMemo(() => {
    const map = new Map<string, string>();
    (cargosQuery.data ?? []).forEach((c) => map.set(c.id, c.nome));
    return map;
  }, [cargosQuery.data]);

  const domingos = useMemo(() => diasDaSemanaDoMes(competencia, 0), [competencia]);
  const inicio = primeiroDiaDoMes(competencia);
  const fim = ultimoDiaDoMes(competencia);
  /** Mês anterior, usado só para achar o último domingo folgado antes do período. */
  const competenciaAnterior = useMemo(() => {
    const [y, m] = competencia.split("-").map(Number);
    const d = new Date(y, (m ?? 1) - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [competencia]);
  const inicioAnterior = primeiroDiaDoMes(competenciaAnterior);



  /** Regra efetiva da unidade (exceção quando existir, senão padrão da empresa). */
  const configDaUnidade = useMemo(() => {
    return (unidadeId: string | null): DpConfigDpForm => {
      if (!unidadeId) return configPadraoEmpresa;
      return rows.find((r) => r.unidade_id === unidadeId) ?? configPadraoEmpresa;
    };
  }, [rows, configPadraoEmpresa]);

  const query = useQuery({
    queryKey: ["dp_conformidade_dsr", selectedCompanyId, competencia, rows.length],
    enabled: !!selectedCompanyId && domingos.length > 0,
    queryFn: async (): Promise<LinhaComUnidade[]> => {
      const { data: colaboradores, error: cErr } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, sexo, domingos_folga_mes, ativo, unidade_id, cargo_id, regime, vinculo_label")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (cErr) throw cErr;

      const { data: folgas, error: fErr } = await supabase
        .from("dp_folgas")
        .select("colaborador_id, data, status")
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio)
        .lte("data", fim);
      if (fErr) throw fErr;

      // Folgas aprovadas nos pedidos: é o que o gestor vê marcado no calendário.
      const { data: aprovadas, error: aErr } = await supabase
        .from("dp_solicitacoes")
        .select("colaborador_id, data_alvo, status, tipo")
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", "folga")
        .eq("status", "aprovada")
        .not("data_alvo", "is", null)
        .gte("data_alvo", inicio)
        .lte("data_alvo", fim);
      if (aErr) throw aErr;

      // Dias fixos de descanso semanal do cadastro de trabalho vigente.
      const { data: configDias, error: dErr } = await supabase
        .from("dp_colaborador_config_dias")
        .select("dow, trabalha, dp_colaborador_config_trabalho!inner(colaborador_id, vigencia_fim)")
        .eq("company_id", selectedCompanyId!)
        .eq("trabalha", false)
        .is("dp_colaborador_config_trabalho.vigencia_fim", null);
      if (dErr) throw dErr;

      const descansoSemanal = new Map<string, number[]>();
      for (const d of configDias ?? []) {
        const colabId = d.dp_colaborador_config_trabalho?.colaborador_id;
        if (!colabId || d.dow === null || d.dow === undefined) continue;
        const arr = descansoSemanal.get(colabId) ?? [];
        arr.push(d.dow);
        descansoSemanal.set(colabId, arr);
      }

      // Origem por colaborador+data, deduplicando registro e pedido aprovado.
      const origens = new Map<string, Map<string, "registrada" | "aprovada">>();
      const registrar = (colabId: string, data: string, origem: "registrada" | "aprovada") => {
        const mapa = origens.get(colabId) ?? new Map<string, "registrada" | "aprovada">();
        if (!mapa.has(data)) mapa.set(data, origem);
        origens.set(colabId, mapa);
      };
      for (const f of folgas ?? []) {
        if (f.status === "cancelada") continue;
        registrar(f.colaborador_id, f.data, "registrada");
      }
      for (const s of aprovadas ?? []) {
        if (!s.data_alvo) continue;
        registrar(s.colaborador_id, s.data_alvo, "aprovada");
      }

      // DSR só se aplica a contratos celetistas; intermitente/PJ ficam fora do relatório.
      return (colaboradores ?? [])
        .filter((c) => contratoPolicy(c.regime, c.vinculo_label).participaConformidadeDsr)
        .map((c) => {
          const cfg = configDaUnidade(c.unidade_id ?? null);
          const negociados = new Set(diasElegiveisDaConfig(cfg).filter((d) => d !== 0));
          const datas = Array.from(origens.get(c.id)?.keys() ?? []).sort();
          const dowsDescanso = descansoSemanal.get(c.id) ?? [];
          const descansoSemanalNoMes = dowsDescanso.reduce(
            (acc, dow) => acc + diasDaSemanaDoMes(competencia, dow).length,
            0,
          );
          return {
            colaboradorId: c.id,
            nome: c.nome,
            sexo: c.sexo,
            domingosMesOverride: c.domingos_folga_mes ?? null,
            unidadeId: c.unidade_id ?? null,
            cargoId: c.cargo_id ?? null,
            domingosFolgados: datas.filter((d) => weekdayIso(d) === 0),
            diasNegociadosFolgados: datas.filter(
              (d) => weekdayIso(d) !== 0 && negociados.has(weekdayIso(d)),
            ),
            folgasOutrosDias: datas.filter(
              (d) => weekdayIso(d) !== 0 && !negociados.has(weekdayIso(d)),
            ),
            descansoSemanalNoMes,
            dowsDescanso,
            origemPorData: origens.get(c.id) ?? new Map<string, "registrada" | "aprovada">(),
            domingosNoPeriodo: domingos.length,
          };
        });
    },
  });


  /** Avalia por unidade, aplicando a regra vigente de cada loja. */
  const linhas: LinhaConformidade[] = useMemo(() => {
    const dados = query.data ?? [];
    const grupos = new Map<string, LinhaComUnidade[]>();
    for (const l of dados) {
      const k = l.unidadeId ?? "__padrao__";
      grupos.set(k, [...(grupos.get(k) ?? []), l]);
    }
    const out: LinhaConformidade[] = [];
    for (const [k, itens] of grupos) {
      out.push(
        ...(avaliarConformidade(itens, configDaUnidade(k === "__padrao__" ? null : k)) as LinhaConformidade[]),
      );
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [query.data, configDaUnidade]);

  /** Selo de uma leitura (CLT ou empresa), reutilizado na tabela, cartões e detalhe. */
  const badgeLeitura = (ok: boolean, rotulo: string) =>
    ok ? (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
      </Badge>
    ) : (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
      </Badge>
    );

  /** Os dois selos juntos: exigência legal e regra da empresa. */
  const badgeSituacao = (l: LinhaConformidade) => (
    <span className="flex flex-wrap items-center justify-center gap-1">
      {badgeLeitura(l.conformeClt, "CLT")}
      {badgeLeitura(l.conformeEmpresa, "Empresa")}
    </span>
  );


  const COLS: Record<ColKey, {
    label: string;
    sortKey: SortKey;
    center?: boolean;
    value: (l: LinhaConformidade) => string;
    render: (l: LinhaConformidade) => JSX.Element;
  }> = {
    colaborador: {
      label: "Colaborador", sortKey: "nome",
      value: (l) => l.nome,
      render: (l) => (
        <span className="font-medium">
          {l.nome}
          {l.sexo === "F" && (
            <span className="ml-2 text-xs text-muted-foreground">(Art. 386 CLT)</span>
          )}
        </span>
      ),
    },
    unidade: {
      label: "Unidade", sortKey: "unidade", center: true,
      value: (l) => (l.unidadeId && unidadeNome.get(l.unidadeId)) || "Sem unidade",
      render: (l) => (
        <span className="text-muted-foreground">
          {(l.unidadeId && unidadeNome.get(l.unidadeId)) || "—"}
        </span>
      ),
    },
    cargo: {
      label: "Cargo", sortKey: "cargo", center: true,
      value: (l) => (l.cargoId && cargoNome.get(l.cargoId)) || "Sem cargo",
      render: (l) => (
        <span className="text-muted-foreground">
          {(l.cargoId && cargoNome.get(l.cargoId)) || "—"}
        </span>
      ),
    },
    folgas: {
      label: "Folgas no mês", sortKey: "folgas", center: true,
      value: (l) => String(l.folgasMarcadas),
      render: (l) => (
        <span className="font-semibold tabular-nums">
          {l.folgasMarcadas === 0 ? (
            <span className="text-destructive">0 · sem folga marcada</span>
          ) : (
            l.folgasMarcadas
          )}
        </span>
      ),
    },
    situacao: {
      label: "Situação", sortKey: "situacao", center: true,
      value: (l) => situacaoLabel(l),
      render: (l) => badgeSituacao(l),
    },
  };

  const {
    colOrder, colWidths, resize, resetWidth,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
  } = useDpTableColumns<ColKey, SortKey>({
    storageKey: "dp_conformidade_col",
    screenKey: "dp_conformidade_dsr",
    defaultOrder: DEFAULT_ORDER,
    defaultWidths: DEFAULT_WIDTHS,
    defaultSortKey: "padrao",
  });

  /** Aplica os filtros por valor de cada coluna sobre as linhas avaliadas. */
  const filtradoPorColuna = useMemo(() => {
    return linhas.filter((l) =>
      (Object.keys(colFilters) as ColKey[]).every((k) => {
        const sel = colFilters[k] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[k].value(l));
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, colFilters, unidadeNome, cargoNome]);

  /** Opções de filtro de uma coluna considerando os filtros das demais. */
  const opcoesColuna = (k: ColKey) => {
    const outros = linhas.filter((l) =>
      (Object.keys(colFilters) as ColKey[]).every((other) => {
        if (other === k) return true;
        const sel = colFilters[other] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[other].value(l));
      }),
    );
    const set = new Set<string>();
    outros.forEach((l) => set.add(COLS[k].value(l)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  /** Ordenação escolhida no cabeçalho; "padrao" mantém a ordem por nome. */
  const linhasFiltradas = useMemo(() => {
    if (sortKey === "padrao") return filtradoPorColuna;
    const col = (Object.keys(COLS) as ColKey[]).find((k) => COLS[k].sortKey === sortKey);
    if (!col) return filtradoPorColuna;
    const arr = [...filtradoPorColuna];
    arr.sort((a, b) => {
      const cmp = sortKey === "folgas"
        ? a.folgasMarcadas - b.folgasMarcadas
        : COLS[col].value(a).localeCompare(COLS[col].value(b), "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradoPorColuna, sortKey, sortDir]);

  const porAcordo =
    configPadraoEmpresa.tipo_descanso_domingo === "acordo_coletivo" ||
    rows.some((r) => r.unidade_id && r.tipo_descanso_domingo === "acordo_coletivo");
  const foraClt = linhas.filter((l) => !l.conformeClt).length;
  const foraEmpresa = linhas.filter((l) => !l.conformeEmpresa).length;
  const filtroForaAtivo = (colFilters.situacao ?? []).some((v) => v !== SITUACAO_OK)
    && !(colFilters.situacao ?? []).includes(SITUACAO_OK);

  /** Selo clicável: alterna o filtro da coluna Situação para quem tem algo em falta. */
  const alternarFiltroFora = () => {
    setColFilters((p) => ({
      ...p,
      situacao: filtroForaAtivo ? [] : [SITUACAO_SO_CLT, SITUACAO_SO_EMPRESA, SITUACAO_AMBAS],
    }));
  };


  /** Textos auxiliares do diálogo de detalhes da linha selecionada. */
  const detalheInfo = useMemo(() => {
    if (!detalhe) return null;
    const cfg = configDaUnidade(detalhe.unidadeId);
    const temRegraPropria =
      !!detalhe.unidadeId && rows.some((r) => r.unidade_id === detalhe.unidadeId);
    const origem = temRegraPropria ? "Regra própria da loja" : "Regra padrão da empresa";
    const negociadosDias = diasElegiveisDaConfig(cfg).filter((d) => d !== 0);
    const negociadosLabel = negociadosDias.map((d) => DIA_SEMANA_CURTO[d]).join(", ");
    const acordo = cfg.tipo_descanso_domingo === "acordo_coletivo";
    const datas = [
      ...(detalhe.domingosFolgados ?? []),
      ...(detalhe.diasNegociadosFolgados ?? []),
      ...(detalhe.folgasOutrosDias ?? []),
    ]
      .sort()
      .map((iso) => ({
        iso,
        dia: DIA_SEMANA_CURTO[weekdayIso(iso)],
        origem: detalhe.origemPorData.get(iso) === "aprovada" ? "aprovada" : "registrada",
        contaClt: weekdayIso(iso) === 0 || (acordo && negociadosDias.includes(weekdayIso(iso))),
      }));
    const descansoLabel = (detalhe.dowsDescanso ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DIA_SEMANA_CURTO[d])
      .join(", ");
    const foraDoDomingo = datas.filter((d) => !d.contaClt);
    return { origem, negociadosLabel, acordo, datas, descansoLabel, foraDoDomingo };
  }, [detalhe, configDaUnidade, rows]);

  const exportarCsv = () => {
    const headers = [
      "Colaborador", "Unidade", "Cargo", "Sexo", "Domingos no mês", "Folgas no mês",
      "Domingos folgados", "Folgas em dias de descanso negociados", "Folgas consideradas (CLT)",
      "Descansos considerados (empresa)", "Regra aplicada", "Mínimo da regra",
      "Mínimo legal", "Mínimo exigido (CLT)",
      "Situação CLT", "Situação regra da empresa",
    ];
    const rowsCsv = linhasFiltradas.map((l) => [
      l.nome,
      (l.unidadeId && unidadeNome.get(l.unidadeId)) || "—",
      (l.cargoId && cargoNome.get(l.cargoId)) || "—",
      l.sexo === "F" ? "Feminino" : l.sexo === "M" ? "Masculino" : "—",
      String(l.domingosNoPeriodo),
      String(l.folgasMarcadas),
      String(l.domingosFolgados.length),
      String(l.negociadosAproveitados),
      String(l.folgasConsideradas),
      String(l.folgasEmpresa),
      l.rotuloFrequencia,
      String(l.esperado),
      String(l.esperadoLegal),
      String(l.esperadoClt),
      l.conformeClt ? "Em ordem" : "Em falta",
      l.conformeEmpresa ? "Em ordem" : "Em falta",
    ]);





    const csv = [headers.join(";"), ...rowsCsv.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dp_conformidade_dsr_${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DpPage>
      {!embedded && (
        <Helmet>
          <title>Conformidade de DSR | Pessoas Aveto 360</title>
          <meta name="description" content="Relatório de domingos trabalhados e folgados por colaborador, comparado à periodicidade legal configurada." />
        </Helmet>
      )}

      <DpPageHeader
        title="Conformidade de DSR"
        description="Folgas de descanso semanal por colaborador no mês, comparadas à regra vigente da unidade e à regra quinzenal feminina."
        icon={ScaleIcon}
        actions={
          <Button variant="outline" onClick={exportarCsv} disabled={linhasFiltradas.length === 0} className="gap-2">
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cd-comp">Competência</Label>
          <Input
            id="cd-comp" type="month" className="w-44"
            value={competencia} onChange={(e) => setCompetencia(e.target.value || competenciaAtual())}
          />
        </div>

        {linhas.length > 0 && (
          <div className="ml-auto flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={alternarFiltroFora}
              className="flex flex-wrap items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={filtroForaAtivo ? "Mostrar todos" : "Ver só quem está com algo em falta"}
            >
              <Badge variant={foraClt > 0 ? "destructive" : "default"}>
                {foraClt > 0 ? `${foraClt} sem folga em domingo (CLT)` : "CLT em ordem"}
              </Badge>
              <Badge variant={foraEmpresa > 0 ? "destructive" : "default"}>
                {foraEmpresa > 0 ? `${foraEmpresa} fora da regra da empresa` : "Regra da empresa em ordem"}
              </Badge>
            </button>

            <p className="text-[11px] text-muted-foreground">
              {linhasFiltradas.length} de {linhas.length} colaborador(es)
            </p>
          </div>
        )}
      </div>


      {query.isError ? (
        <DpErrorState onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DpContentCard contentClassName="p-3 md:p-0">
          {/* Mobile: cartões por colaborador */}
          <ul className="space-y-3 md:hidden">
            {linhasFiltradas.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">
                {linhas.length === 0
                  ? "Nenhum colaborador ativo no período."
                  : "Nenhum resultado para os filtros aplicados."}
              </li>
            )}
            {linhasFiltradas.map((l) => (
              <li key={l.colaboradorId}>
                <button
                  type="button"
                  onClick={() => setDetalhe(l)}
                  className={cn(
                    "w-full rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !l.conforme && "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[
                          (l.unidadeId && unidadeNome.get(l.unidadeId)) || null,
                          (l.cargoId && cargoNome.get(l.cargoId)) || null,
                        ].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>

                    <span className="shrink-0">{badgeSituacao(l)}</span>
                  </div>
                  <p className="mt-2 text-xs">
                    <span className="text-muted-foreground">Folgas no mês: </span>
                    <span className="font-semibold tabular-nums">
                      {l.folgasMarcadas}
                      {l.folgasMarcadas === 0 && (
                        <span className="ml-1 font-normal text-destructive">sem folga marcada</span>
                      )}
                    </span>
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden w-full overflow-x-auto md:block">
          <Table className="table-fixed" style={{ width: "100%", minWidth: larguraTotal }}>
            <TableHeader>
              <TableRow>
                {colOrder.map((k) => (
                  <DpTableColumnHeader
                    key={k}
                    label={COLS[k].label}
                    width={colWidths[k]}
                    center={COLS[k].center}
                    sortAtivo={sortKey === COLS[k].sortKey}
                    sortDir={sortDir}
                    onSort={(dir) => aplicarSort(COLS[k].sortKey, dir)}
                    ativos={colFilters[k]}
                    getOpcoes={() => opcoesColuna(k)}
                    onToggle={(v) => toggleColValue(k, v)}
                    onSelecionarTodos={() => setColFilters((p) => ({ ...p, [k]: opcoesColuna(k) }))}
                    onLimpar={() => setColFilters((p) => ({ ...p, [k]: [] }))}
                    arrastando={dragCol === k}
                    onDragStart={() => setDragCol(k)}
                    onDrop={() => soltarSobre(k)}
                    onDragEnd={() => setDragCol(null)}
                    onResize={(largura) => resize(k, largura)}
                    onResetWidth={() => resetWidth(k)}
                  />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colOrder.length} className="py-8 text-center text-sm text-muted-foreground">

                    {linhas.length === 0
                      ? "Nenhum colaborador ativo no período."
                      : "Nenhum resultado para os filtros aplicados."}
                  </TableCell>
                </TableRow>
              ) : (
                linhasFiltradas.map((l) => (
                  <TableRow
                    key={l.colaboradorId}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50",
                      !l.conforme && "bg-destructive/5",
                    )}
                    onClick={() => setDetalhe(l)}
                  >
                    {colOrder.map((k) => (
                      <TableCell
                        key={k}
                        className={cn("overflow-hidden", COLS[k].center && "text-center")}
                        style={{ width: colWidths[k], maxWidth: colWidths[k] }}
                      >
                        {COLS[k].render(l)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </DpContentCard>
      )}

      {/* Detalhes do colaborador no mês */}
      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-w-lg">
          {detalhe && detalheInfo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detalhe.nome}
                  {detalhe.sexo === "F" && (
                    <span className="text-xs font-normal text-muted-foreground">(Art. 386 CLT)</span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {[
                    (detalhe.unidadeId && unidadeNome.get(detalhe.unidadeId)) || null,
                    (detalhe.cargoId && cargoNome.get(detalhe.cargoId)) || null,
                  ].filter(Boolean).join(" · ") || "—"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Situação no mês</span>
                  {badgeSituacao(detalhe)}
                </div>

                <div>
                  <p className="text-muted-foreground">Regra aplicada</p>
                  <p className="font-semibold">{detalhe.rotuloFrequencia}</p>
                  <p className="text-xs text-muted-foreground">{detalheInfo.origem}.</p>
                </div>

                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">Exigência legal (CLT)</p>
                    {badgeLeitura(detalhe.conformeClt, detalhe.conformeClt ? "Em ordem" : "Em falta")}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground">Domingos no mês</p>
                      <p className="font-semibold tabular-nums">{detalhe.domingosNoPeriodo}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Mínimo exigido</p>
                      <p className="font-semibold tabular-nums">{detalhe.esperadoClt}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Domingos folgados</p>
                      <p className="font-semibold tabular-nums">{detalhe.domingosFolgados.length}</p>
                    </div>

                    <div>
                      <p className="text-muted-foreground">Folgas consideradas</p>
                      <p className="font-semibold tabular-nums">{detalhe.folgasConsideradas}</p>
                    </div>
                  </div>
                  {detalhe.esperadoClt > detalhe.esperado && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      A regra cadastrada pede {detalhe.esperado}, mas o mínimo legal do mês é{" "}
                      {detalhe.esperadoLegal}
                      {detalhe.sexo === "F"
                        ? " — Art. 386 da CLT: 1 domingo de folga a cada 2 semanas para mulheres."
                        : " pelo padrão legal do setor."}
                    </p>
                  )}
                  {detalheInfo.acordo && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Por acordo coletivo, os dias de descanso combinados
                      {detalheInfo.negociadosLabel ? ` (${detalheInfo.negociadosLabel})` : ""} substituem
                      o domingo na contagem da folga semanal obrigatória
                      ({detalhe.negociadosAproveitados} no mês).
                    </p>
                  )}

                </div>

                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">Regra da empresa</p>
                    {badgeLeitura(detalhe.conformeEmpresa, detalhe.conformeEmpresa ? "Em ordem" : "Em falta")}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground">Mínimo da regra</p>
                      <p className="font-semibold tabular-nums">{detalhe.esperado}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Descansos considerados</p>
                      <p className="font-semibold tabular-nums">{detalhe.folgasEmpresa}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Folgas marcadas</p>
                      <p className="font-semibold tabular-nums">{detalhe.folgasMarcadas}</p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {detalheInfo.descansoLabel
                      ? `Inclui o descanso fixo do cadastro de trabalho (${detalheInfo.descansoLabel}), que não gera registro de folga.`
                      : "Sem descanso fixo no cadastro de trabalho; conta só as folgas marcadas."}
                  </p>
                </div>

                <div>
                  <p className="text-muted-foreground">Folgas marcadas no mês</p>
                  {detalheInfo.datas.length === 0 ? (
                    <p className="text-destructive">Nenhuma folga marcada no período.</p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {detalheInfo.datas.map((d) => (
                        <li
                          key={d.iso}
                          className="rounded-full border border-border px-2.5 py-0.5 text-xs tabular-nums"
                          title={
                            d.origem === "aprovada"
                              ? "Pedido de folga aprovado"
                              : "Folga registrada na escala"
                          }
                        >
                          {d.dia} {diaMesIso(d.iso)}
                          {d.origem === "aprovada" ? " · aprovada" : ""}
                          {d.contaClt ? "" : " · não conta para a CLT"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
