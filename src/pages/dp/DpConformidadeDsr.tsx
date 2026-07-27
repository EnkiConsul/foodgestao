import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { ScaleIcon, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpConfigDp } from "@/hooks/useDpConfigDp";
import { avaliarConformidade, type ConformidadeInput } from "@/lib/dp/dsr-rules";
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

/** Lista os domingos (ISO yyyy-mm-dd) de um mês de referência 'yyyy-mm'. */
function domingosDoMes(competencia: string): string[] {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m) return [];
  const out: string[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m - 1, d);
    if (date.getDay() === 0) out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

const competenciaAtual = () => new Date().toISOString().slice(0, 7);

export default function DpConformidadeDsr() {
  const { selectedCompanyId } = useCompanyContext();
  const { config } = useDpConfigDp();
  const [competencia, setCompetencia] = useState(competenciaAtual);

  const domingos = useMemo(() => domingosDoMes(competencia), [competencia]);
  const inicio = domingos[0] ?? `${competencia}-01`;
  const fim = `${competencia}-31`;

  const query = useQuery({
    queryKey: ["dp_conformidade_dsr", selectedCompanyId, competencia],
    enabled: !!selectedCompanyId && domingos.length > 0,
    queryFn: async (): Promise<ConformidadeInput[]> => {
      const { data: colaboradores, error: cErr } = await supabase
        .from("dp_colaboradores")
        .select("id, nome_completo, sexo, ativo")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome_completo");
      if (cErr) throw cErr;

      const { data: folgas, error: fErr } = await supabase
        .from("dp_folgas")
        .select("colaborador_id, data, status")
        .eq("company_id", selectedCompanyId!)
        .gte("data", `${competencia}-01`)
        .lte("data", fim);
      if (fErr) throw fErr;

      const porColab = new Map<string, string[]>();
      for (const f of folgas ?? []) {
        if (f.status === "cancelada") continue;
        if (!domingos.includes(f.data)) continue;
        const arr = porColab.get(f.colaborador_id) ?? [];
        arr.push(f.data);
        porColab.set(f.colaborador_id, arr);
      }

      return (colaboradores ?? []).map((c) => ({
        colaboradorId: c.id,
        nome: c.nome_completo,
        sexo: c.sexo,
        domingosFolgados: porColab.get(c.id) ?? [],
        domingosNoPeriodo: domingos.length,
      }));
    },
  });

  const linhas = useMemo(
    () => avaliarConformidade(query.data ?? [], config),
    [query.data, config],
  );
  const foraDeConformidade = linhas.filter((l) => !l.conforme).length;

  const exportarCsv = () => {
    const headers = [
      "Colaborador", "Sexo", "Domingos no mês", "Domingos folgados",
      "Periodicidade aplicada (semanas)", "Mínimo esperado", "Situação",
    ];
    const rows = linhas.map((l) => [
      l.nome,
      l.sexo === "F" ? "Feminino" : l.sexo === "M" ? "Masculino" : "—",
      String(l.domingosNoPeriodo),
      String(l.domingosFolgados.length),
      String(l.periodicidadeAplicada),
      String(l.esperado),
      l.conforme ? "Conforme" : "Fora de conformidade",
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
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
        <title>Conformidade de DSR | DP 360°FOOD</title>
        <meta name="description" content="Relatório de domingos trabalhados e folgados por colaborador, comparado à periodicidade legal configurada." />
      </Helmet>

      <DpPageHeader
        title="Conformidade de DSR"
        description="Domingos folgados por colaborador no mês, comparados à periodicidade configurada e à regra quinzenal feminina."
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
              Regra geral: 1 a cada {config.periodicidade_domingo} semana(s) · Mulheres: 1 a cada{" "}
              {config.periodicidade_domingo_mulher} semana(s).
            </p>
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
        <DpContentCard contentClassName="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead className="text-center">Domingos no mês</TableHead>
                <TableHead className="text-center">Folgados</TableHead>
                <TableHead className="text-center">Mínimo esperado</TableHead>
                <TableHead className="text-center">Periodicidade</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
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
                    <TableCell className="text-center">{l.esperado}</TableCell>
                    <TableCell className="text-center">
                      {l.periodicidadeAplicada > 0 ? `${l.periodicidadeAplicada} sem.` : "sem exigência"}
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
