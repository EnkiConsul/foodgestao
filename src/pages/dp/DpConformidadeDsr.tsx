import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { ScaleIcon, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp, type DpConfigDpForm } from "@/hooks/useDpConfigDp";
import {
  avaliarConformidade, DIA_SEMANA_CURTO, semanasDaConfig,
  type ConformidadeInput, type ConformidadeLinha,
} from "@/lib/dp/dsr-rules";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

import { DpPage, DpPageHeader, DpContentCard, DpFilterCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
}

export default function DpConformidadeDsr() {
  const { selectedCompanyId } = useCompanyContext();
  const { config: configPadraoEmpresa, rows } = useDpConfigDp();
  const [competencia, setCompetencia] = useState(competenciaAtual);

  const domingos = useMemo(() => diasDaSemanaDoMes(competencia, 0), [competencia]);
  const fim = `${competencia}-31`;

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
        .select("id, nome, sexo, ativo, unidade_id, regime")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (cErr) throw cErr;

      const { data: folgas, error: fErr } = await supabase
        .from("dp_folgas")
        .select("colaborador_id, data, status")
        .eq("company_id", selectedCompanyId!)
        .gte("data", `${competencia}-01`)
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
        .filter((c) => contratoPolicy(c.regime).participaConformidadeDsr)
        .map((c) => {

        const cfg = configDaUnidade(c.unidade_id ?? null);
        const negociados = new Set((cfg.dias_descanso_negociados ?? []).filter((d) => d !== 0));
        return {
          colaboradorId: c.id,
          nome: c.nome,
          sexo: c.sexo,
          unidadeId: c.unidade_id ?? null,
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
  const linhas: ConformidadeLinha[] = useMemo(() => {
    const dados = query.data ?? [];
    const grupos = new Map<string, LinhaComUnidade[]>();
    for (const l of dados) {
      const k = l.unidadeId ?? "__padrao__";
      grupos.set(k, [...(grupos.get(k) ?? []), l]);
    }
    const out: ConformidadeLinha[] = [];
    for (const [k, itens] of grupos) {
      out.push(...avaliarConformidade(itens, configDaUnidade(k === "__padrao__" ? null : k)));
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [query.data, configDaUnidade]);

  const porAcordo = configPadraoEmpresa.tipo_descanso_domingo === "acordo_coletivo";
  const semanas = semanasDaConfig(configPadraoEmpresa);
  const diasNegociadosLabel = (configPadraoEmpresa.dias_descanso_negociados ?? [])
    .map((d) => DIA_SEMANA_CURTO[d])
    .join(", ");
  const foraDeConformidade = linhas.filter((l) => !l.conforme).length;

  const exportarCsv = () => {
    const headers = [
      "Colaborador", "Sexo", "Domingos no mês", "Domingos folgados",
      "Dias negociados aproveitados", "Folgas consideradas",
      "Periodicidade aplicada (semanas)", "Mínimo esperado", "Situação",
    ];
    const rowsCsv = linhas.map((l) => [
      l.nome,
      l.sexo === "F" ? "Feminino" : l.sexo === "M" ? "Masculino" : "—",
      String(l.domingosNoPeriodo),
      String(l.domingosFolgados.length),
      String(l.negociadosAproveitados),
      String(l.folgasConsideradas),
      l.periodicidadeAplicada.toFixed(1),
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
      <Helmet>
        <title>Conformidade de DSR | Pessoas 360°FOOD</title>
        <meta name="description" content="Relatório de domingos trabalhados e folgados por colaborador, comparado à periodicidade legal configurada." />
      </Helmet>

      <DpPageHeader
        title="Conformidade de DSR"
        description="Folgas de descanso semanal por colaborador no mês, comparadas à regra vigente da unidade e à regra quinzenal feminina."
        icon={ScaleIcon}
        actions={
          <Button variant="outline" onClick={exportarCsv} disabled={linhas.length === 0} className="gap-2">
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
            <Badge variant={foraDeConformidade > 0 ? "destructive" : "default"} className="ml-auto">
              {foraDeConformidade > 0
                ? `${foraDeConformidade} fora de conformidade`
                : "Todos conformes"}
            </Badge>
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
            {linhas.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">
                Nenhum colaborador ativo no período.
              </li>
            )}
            {linhas.map((l) => (
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
                <TableHead className="text-center">Domingos no mês</TableHead>
                <TableHead className="text-center">Folgados</TableHead>
                {porAcordo && <TableHead className="text-center">Dias negociados</TableHead>}
                <TableHead className="text-center">Mínimo esperado</TableHead>
                <TableHead className="text-center">Periodicidade</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={porAcordo ? 7 : 6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum colaborador ativo no período.
                  </TableCell>
                </TableRow>
              ) : (
                linhas.map((l) => (
                  <TableRow key={l.colaboradorId} className={l.conforme ? undefined : "bg-destructive/5"}>
                    <TableCell className="font-medium">
                      {l.nome}
                      {l.sexo === "F" && (
                        <span className="ml-2 text-xs text-muted-foreground">(Art. 386 CLT)</span>
                      )}
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
