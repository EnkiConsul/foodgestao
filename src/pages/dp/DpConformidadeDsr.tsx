import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { ScaleIcon, Download, CheckCircle2, AlertTriangle, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import {
  avaliarConformidade, DIA_SEMANA_CURTO, semanasDaConfig, rotuloFrequencia,
  tipoDiasDescanso, diasElegiveisDaConfig,
  type ConformidadeInput, type ConformidadeLinha,
} from "@/lib/dp/dsr-rules";

import { primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/dp/competencia";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

import { cn } from "@/lib/utils";
import { DpPage, DpPageHeader, DpContentCard, DpFilterCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

interface LinhaComUnidade extends ConformidadeInput {
  unidadeId: string | null;
  cargoId: string | null;
}

type LinhaConformidade = ConformidadeLinha & { unidadeId: string | null; cargoId: string | null };

const TODOS = "__todos__";
const SEM_VINCULO = "__sem__";

export default function DpConformidadeDsr() {
  const embedded = useDpEmbedded();
  const { selectedCompanyId } = useCompanyContext();
  const { config: configPadraoEmpresa, rows } = useDpConfigDp();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>(TODOS);
  const [cargoFiltro, setCargoFiltro] = useState<string>(TODOS);
  const [situacaoFiltro, setSituacaoFiltro] = useState<"todos" | "fora" | "conforme">("todos");
  const [busca, setBusca] = useState("");

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

      const porColab = new Map<string, string[]>();
      const outrasFolgas = new Map<string, string[]>();
      for (const f of folgas ?? []) {
        if (f.status === "cancelada") continue;
        const bucket = weekdayIso(f.data) === 0 ? porColab : outrasFolgas;
        const arr = bucket.get(f.colaborador_id) ?? [];
        arr.push(f.data);
        bucket.set(f.colaborador_id, arr);
      }

      // DSR só se aplica a contratos celetistas; intermitente/PJ ficam fora do relatório.
      return (colaboradores ?? [])
        .filter((c) => contratoPolicy(c.regime, c.vinculo_label).participaConformidadeDsr)
        .map((c) => {

        const cfg = configDaUnidade(c.unidade_id ?? null);
        const negociados = new Set((cfg.dias_descanso_negociados ?? []).filter((d) => d !== 0));
        return {
          colaboradorId: c.id,
          nome: c.nome,
          sexo: c.sexo,
          domingosMesOverride: c.domingos_folga_mes ?? null,
          unidadeId: c.unidade_id ?? null,
          cargoId: c.cargo_id ?? null,
          domingosFolgados: porColab.get(c.id) ?? [],
          diasNegociadosFolgados: (outrasFolgas.get(c.id) ?? []).filter((d) =>
            negociados.has(weekdayIso(d)),
          ),
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

  /** Aplica os filtros do gestor sobre as linhas avaliadas. */
  const linhasFiltradas: LinhaConformidade[] = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (unidadeFiltro !== TODOS) {
        const alvo = unidadeFiltro === SEM_VINCULO ? null : unidadeFiltro;
        if ((l.unidadeId ?? null) !== alvo) return false;
      }
      if (cargoFiltro !== TODOS) {
        const alvo = cargoFiltro === SEM_VINCULO ? null : cargoFiltro;
        if ((l.cargoId ?? null) !== alvo) return false;
      }
      if (situacaoFiltro === "fora" && l.conforme) return false;
      if (situacaoFiltro === "conforme" && !l.conforme) return false;
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [linhas, unidadeFiltro, cargoFiltro, situacaoFiltro, busca]);

  const filtrosAtivos =
    unidadeFiltro !== TODOS || cargoFiltro !== TODOS || situacaoFiltro !== "todos" || busca.trim() !== "";
  const limparFiltros = () => {
    setUnidadeFiltro(TODOS);
    setCargoFiltro(TODOS);
    setSituacaoFiltro("todos");
    setBusca("");
  };

  const porAcordo =
    configPadraoEmpresa.tipo_descanso_domingo === "acordo_coletivo" ||
    rows.some((r) => r.unidade_id && r.tipo_descanso_domingo === "acordo_coletivo");
  const tipoDias = tipoDiasDescanso(diasElegiveisDaConfig(configPadraoEmpresa));
  const regraPadraoLabel = rotuloFrequencia(
    configPadraoEmpresa.modo_frequencia_domingo ?? "semanas",
    (configPadraoEmpresa.modo_frequencia_domingo ?? "semanas") === "por_mes"
      ? (configPadraoEmpresa.domingos_por_mes ?? 0)
      : semanasDaConfig(configPadraoEmpresa).geral,
    tipoDias,
  );
  const regraMulherLabel = rotuloFrequencia(
    configPadraoEmpresa.modo_frequencia_domingo_mulher ?? "semanas",
    (configPadraoEmpresa.modo_frequencia_domingo_mulher ?? "semanas") === "por_mes"
      ? (configPadraoEmpresa.domingos_por_mes_mulher ?? 0)
      : semanasDaConfig(configPadraoEmpresa).mulher,
    tipoDias,
  );
  const unidadesComExcecao = rows.filter((r) => r.unidade_id).length;
  const diasNegociadosLabel = (configPadraoEmpresa.dias_descanso_negociados ?? [])
    .map((d) => DIA_SEMANA_CURTO[d])
    .join(", ");
  const foraDeConformidade = linhas.filter((l) => !l.conforme).length;
  const foraFiltrado = linhasFiltradas.filter((l) => !l.conforme).length;



  const exportarCsv = () => {
    const headers = [
      "Colaborador", "Unidade", "Cargo", "Sexo", "Domingos no mês", "Folgas no mês",
      "Domingos folgados", "Dias negociados aproveitados", "Folgas consideradas",
      "Regra aplicada", "Mínimo esperado", "Situação",
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
      l.rotuloFrequencia,
      String(l.esperado),
      l.conforme ? "Conforme" : "Fora de conformidade",
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

      <DpFilterCard>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-comp">Competência</Label>
            <Input
              id="cd-comp" type="month" className="w-44"
              value={competencia} onChange={(e) => setCompetencia(e.target.value || competenciaAtual())}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cd-unidade">Unidade</Label>
            <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
              <SelectTrigger id="cd-unidade" className="w-48">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as unidades</SelectItem>
                {(unidadesQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
                <SelectItem value={SEM_VINCULO}>Sem unidade</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cd-cargo">Cargo</Label>
            <Select value={cargoFiltro} onValueChange={setCargoFiltro}>
              <SelectTrigger id="cd-cargo" className="w-44">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os cargos</SelectItem>
                {(cargosQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
                <SelectItem value={SEM_VINCULO}>Sem cargo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cd-situacao">Situação</Label>
            <Select
              value={situacaoFiltro}
              onValueChange={(v) => setSituacaoFiltro(v as typeof situacaoFiltro)}
            >
              <SelectTrigger id="cd-situacao" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as situações</SelectItem>
                <SelectItem value="fora">Só fora de conformidade</SelectItem>
                <SelectItem value="conforme">Só conformes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cd-busca">Colaborador</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="cd-busca" className="w-52 pl-8" placeholder="Buscar por nome"
                value={busca} onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          {filtrosAtivos && (
            <Button variant="ghost" size="sm" onClick={limparFiltros} className="gap-1">
              <X className="h-4 w-4" aria-hidden="true" /> Limpar filtros
            </Button>
          )}

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{domingos.length} domingo(s) no período.</p>
            <p>
              Regra padrão: 1 a cada {semanas.geral ? semanas.geral.toFixed(1) : "—"} semana(s) · Mulheres: 1 a cada{" "}
              {semanas.mulher ? semanas.mulher.toFixed(1) : "—"} semana(s).
            </p>
            <p>
              {porAcordo
                ? `Modo acordo coletivo: dias negociados (${diasNegociadosLabel || "—"}) substituem o domingo.`
                : "Modo legislação: apenas domingos folgados são considerados."}
            </p>
            <p>Unidades com exceção própria são avaliadas pela regra da própria loja.</p>
          </div>

          {linhas.length > 0 && (
            <div className="ml-auto flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => setSituacaoFiltro(situacaoFiltro === "fora" ? "todos" : "fora")}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={situacaoFiltro === "fora" ? "Mostrar todos" : "Ver só quem está fora de conformidade"}
              >
                <Badge variant={foraFiltrado > 0 ? "destructive" : "default"}>
                  {foraFiltrado > 0 ? `${foraFiltrado} fora de conformidade` : "Todos conformes"}
                </Badge>
              </button>
              <p className="text-[11px] text-muted-foreground">
                {linhasFiltradas.length} de {linhas.length} colaborador(es)
                {filtrosAtivos && foraDeConformidade !== foraFiltrado
                  ? ` · ${foraDeConformidade} fora no total`
                  : ""}
              </p>
            </div>
          )}
        </div>
      </DpFilterCard>


      {query.isError ? (
        <DpErrorState onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DpContentCard contentClassName="p-3 md:p-0 md:overflow-x-auto">
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
              <li
                key={l.colaboradorId}
                className={cn(
                  "rounded-2xl border border-border bg-card p-3",
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
                    {l.sexo === "F" && (
                      <p className="text-[11px] text-muted-foreground">Art. 386 CLT</p>
                    )}
                  </div>

                  {l.conforme ? (
                    <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Conforme
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Fora
                    </Badge>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Domingos no mês</p>
                    <p className="font-semibold tabular-nums">{l.domingosNoPeriodo}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Folgados</p>
                    <p className="font-semibold tabular-nums">{l.domingosFolgados.length}</p>
                  </div>
                  {porAcordo && (
                    <div>
                      <p className="text-muted-foreground">Dias negociados</p>
                      <p className="font-semibold tabular-nums">{l.negociadosAproveitados}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Mínimo esperado</p>
                    <p className="font-semibold tabular-nums">{l.esperado}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Periodicidade</p>
                    <p className="font-semibold">
                      {l.periodicidadeAplicada > 0 ? `${l.periodicidadeAplicada.toFixed(1)} sem.` : "sem exigência"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-center">Domingos no mês</TableHead>
                <TableHead className="text-center">Folgados</TableHead>
                {porAcordo && <TableHead className="text-center">Dias negociados</TableHead>}
                <TableHead className="text-center">Mínimo esperado</TableHead>
                <TableHead className="text-center">Periodicidade</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={porAcordo ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                    {linhas.length === 0
                      ? "Nenhum colaborador ativo no período."
                      : "Nenhum resultado para os filtros aplicados."}
                  </TableCell>
                </TableRow>
              ) : (
                linhasFiltradas.map((l) => (
                  <TableRow key={l.colaboradorId} className={l.conforme ? undefined : "bg-destructive/5"}>
                    <TableCell className="font-medium">
                      {l.nome}
                      {l.sexo === "F" && (
                        <span className="ml-2 text-xs text-muted-foreground">(Art. 386 CLT)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(l.unidadeId && unidadeNome.get(l.unidadeId)) || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(l.cargoId && cargoNome.get(l.cargoId)) || "—"}
                    </TableCell>
                    <TableCell className="text-center">{l.domingosNoPeriodo}</TableCell>
                    <TableCell className="text-center font-semibold">{l.domingosFolgados.length}</TableCell>
                    {porAcordo && <TableCell className="text-center">{l.negociadosAproveitados}</TableCell>}

                    <TableCell className="text-center">{l.esperado}</TableCell>
                    <TableCell className="text-center">
                      {l.periodicidadeAplicada > 0
                        ? `${l.periodicidadeAplicada.toFixed(1)} sem.`
                        : "sem exigência"}
                    </TableCell>

                    <TableCell className="text-right">
                      {l.conforme ? (
                        <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Conforme
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Fora
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DpContentCard>
      )}
    </DpPage>
  );
}
