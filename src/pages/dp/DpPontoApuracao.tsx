import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Calculator, Download, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPontoMes } from "@/hooks/useDpPontoMes";
import { useDpFolhaApuracao } from "@/hooks/useDpFolhaApuracao";
import { formatarDuracao, formatarSaldo } from "@/lib/dp/ponto";
import { apurarColaborador, apuracaoParaCsv, somarApuracoes, type LinhaApuracao } from "@/lib/dp/apuracao";
import { PERIODO_STATUS_LABEL, type FolhaPeriodoStatus } from "@/lib/dp/folha";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const competenciaAtual = () => new Date().toISOString().slice(0, 7);

const somarMes = (comp: string, delta: number) => {
  const [ano, mes] = comp.split("-").map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const rotuloMes = (comp: string) =>
  new Date(`${comp}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


const baixarCsv = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

export default function DpPontoApuracao() {
  const { selectedCompanyId } = useCompanyContext();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [unidadeId, setUnidadeId] = useState<string>("todas");

  const unidades = useQuery({
    queryKey: ["dp_unidades_ponto", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { linhas, isLoading, error } = useDpPontoMes(competencia, unidadeId === "todas" ? null : unidadeId);
  const { bases, periodo, semSalario, enviarParaFolha } = useDpFolhaApuracao(competencia);

  const apuracao: LinhaApuracao[] = useMemo(
    () =>
      linhas.map((l) => ({
        colaborador_id: l.colaborador_id,
        nome: l.nome,
        rubricas: apurarColaborador(l.dias, { valorHora: bases.get(l.colaborador_id)?.valorHora }),
        saldoAcumuladoMinutos: l.saldoAcumuladoMinutos,
        fechado: l.fechado,
      })),
    [linhas, bases],
  );

  const totais = useMemo(() => somarApuracoes(apuracao), [apuracao]);
  const totalBruto = useMemo(
    () => apuracao.reduce((acc, l) => acc + (l.rubricas.valores?.liquido ?? 0), 0),
    [apuracao],
  );


  if (error) return <DpErrorState message="Não foi possível carregar a apuração do ponto." />;

  return (
    <DpPage>
      <Helmet>
        <title>Apuração para Folha | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Rubricas do ponto por colaborador: horas normais, extras 50% e 100%, adicional noturno, faltas e DSR."
        />
      </Helmet>

      <DpPageHeader
        title="Apuração para Folha"
        description="Rubricas do mês por colaborador, prontas para lançar na folha."
        icon={Calculator}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/dp/ponto/time">Ponto do Time</Link>
          </Button>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {(unidades.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Competência</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCompetencia(somarMes(competencia, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex-1 text-center text-sm font-medium first-letter:uppercase">
                {rotuloMes(competencia)}
              </span>
              <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCompetencia(somarMes(competencia, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DpFilterCard>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Horas normais</p>
              <p className="text-lg font-semibold">{formatarDuracao(totais.minutosNormais)}</p>
            </DpContentCard>
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Extras 50% / 100%</p>
              <p className="text-lg font-semibold">
                {formatarDuracao(totais.minutosExtras50)} / {formatarDuracao(totais.minutosExtras100)}
              </p>
            </DpContentCard>
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Adicional noturno</p>
              <p className="text-lg font-semibold">{formatarDuracao(totais.minutosNoturnos)}</p>
            </DpContentCard>
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Faltas / DSR perdidos</p>
              <p className="text-lg font-semibold">{totais.diasFalta} / {totais.dsrPerdidos}</p>
            </DpContentCard>
          </div>

          <DpContentCard className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Total estimado da folha (líquido do ponto)</p>
                <p className="text-xl font-semibold">{moeda(totalBruto)}</p>
              </div>
              {periodo && (
                <Link to={`/dp/folha/${periodo.id}`} className="shrink-0">
                  <Badge variant={periodo.status === "aberto" ? "secondary" : "default"}>
                    {PERIODO_STATUS_LABEL[periodo.status as FolhaPeriodoStatus] ?? periodo.status} ·{" "}
                    {periodo.totalLancamentos} lançamento(s)
                  </Badge>
                </Link>
              )}
            </div>
            {semSalario > 0 && (
              <p className="text-xs text-muted-foreground">
                {semSalario} colaborador(es) sem salário base no cargo ficam de fora da geração.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!apuracao.length}
                onClick={() => baixarCsv(`apuracao-folha-${competencia}.csv`, apuracaoParaCsv(competencia, apuracao))}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button
                size="sm"
                disabled={!apuracao.length || enviarParaFolha.isPending || (!!periodo && periodo.status !== "aberto")}
                onClick={() => enviarParaFolha.mutate(apuracao)}
              >
                <Send className="mr-2 h-4 w-4" />
                {enviarParaFolha.isPending ? "Gerando..." : "Gerar Lançamentos da Folha"}
              </Button>
            </div>
          </DpContentCard>

          <DpContentCard className="p-0">
            {!apuracao.length ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum colaborador ativo nesta unidade.</p>
            ) : (
              <ul className="divide-y">
                {apuracao.map((l) => (
                  <li key={l.colaborador_id} className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{l.nome}</p>
                      <div className="flex items-center gap-2">
                        {l.rubricas.valores && (
                          <span className="text-sm font-semibold">{moeda(l.rubricas.valores.liquido)}</span>
                        )}
                        <Badge variant={l.fechado ? "default" : "secondary"}>{l.fechado ? "Fechado" : "Aberto"}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>Normais: <strong className="text-foreground">{formatarDuracao(l.rubricas.minutosNormais)}</strong></span>
                      <span>Extras 50%: <strong className="text-foreground">{formatarDuracao(l.rubricas.minutosExtras50)}</strong></span>
                      <span>Extras 100%: <strong className="text-foreground">{formatarDuracao(l.rubricas.minutosExtras100)}</strong></span>
                      <span>Noturno: <strong className="text-foreground">{formatarDuracao(l.rubricas.minutosNoturnos)}</strong></span>
                      <span>Faltas: <strong className="text-foreground">{l.rubricas.diasFalta}</strong> · DSR: <strong className="text-foreground">{l.rubricas.dsrPerdidos}</strong></span>
                      <span>Banco: <strong className="text-foreground">{formatarSaldo(l.saldoAcumuladoMinutos)}</strong></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DpContentCard>
        </>
      )}
    </DpPage>
  );
}
