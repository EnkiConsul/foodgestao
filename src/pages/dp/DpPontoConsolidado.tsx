import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Lock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpPontoMes } from "@/hooks/useDpPontoMes";
import { equipeParaCsv, formatarDuracao, formatarSaldo } from "@/lib/dp/ponto";

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

const baixarCsv = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

export default function DpPontoConsolidado() {
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

  const { linhas, isLoading, error, fecharLote } = useDpPontoMes(
    competencia,
    unidadeId === "todas" ? null : unidadeId,
  );

  const totais = useMemo(
    () =>
      linhas.reduce(
        (acc, l) => ({
          abertos: acc.abertos + (l.fechado ? 0 : 1),
          pendencias: acc.pendencias + l.pendencias,
          faltas: acc.faltas + l.totais.faltas,
          saldo: acc.saldo + l.totais.saldoMinutos,
        }),
        { abertos: 0, pendencias: 0, faltas: 0, saldo: 0 },
      ),
    [linhas],
  );

  const fecharTodos = () => {
    const abertos = linhas.filter((l) => !l.fechado);
    if (!abertos.length) {
      toast.info("Todos os colaboradores já estão fechados nesta competência.");
      return;
    }
    const comPendencia = abertos.filter((l) => l.pendencias > 0).length;
    const aviso = comPendencia
      ? `${comPendencia} colaborador(es) com marcações incompletas. `
      : "";
    if (!window.confirm(`${aviso}Fechar a competência de ${abertos.length} colaborador(es)?`)) return;
    fecharLote.mutate(abertos, {
      onSuccess: (qtd) => toast.success(`${qtd} fechamento(s) registrado(s).`),
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível fechar em lote."),
    });
  };

  if (error) return <DpErrorState message="Não foi possível carregar a consolidação de ponto." />;

  return (
    <DpPage>
      <Helmet>
        <title>Ponto do Time | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Consolidação mensal do ponto de todos os colaboradores, com banco de horas e fechamento em lote."
        />
      </Helmet>

      <DpPageHeader
        title="Ponto do Time"
        description="Consolidação mensal por colaborador e fechamento em lote."
        icon={Users}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/dp/ponto">Espelho Individual</Link>
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
              <p className="text-xs text-muted-foreground">Em aberto</p>
              <p className="text-lg font-semibold">{totais.abertos}</p>
            </DpContentCard>
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Pendências</p>
              <p className="text-lg font-semibold">{totais.pendencias}</p>
            </DpContentCard>
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Faltas</p>
              <p className="text-lg font-semibold">{totais.faltas}</p>
            </DpContentCard>
            <DpContentCard className="p-3">
              <p className="text-xs text-muted-foreground">Saldo do mês</p>
              <p className="text-lg font-semibold">{formatarSaldo(totais.saldo)}</p>
            </DpContentCard>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!linhas.length}
              onClick={() => baixarCsv(`ponto-time-${competencia}.csv`, equipeParaCsv(competencia, linhas))}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button size="sm" disabled={!totais.abertos || fecharLote.isPending} onClick={fecharTodos}>
              <Lock className="mr-2 h-4 w-4" />
              Fechar Competência em Lote
            </Button>
          </div>

          <DpContentCard className="p-0">
            {!linhas.length ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum colaborador ativo nesta unidade.</p>
            ) : (
              <ul className="divide-y">
                {linhas.map((l) => (
                  <li key={l.colaborador_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{l.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Trabalhado {formatarDuracao(l.totais.minutosTrabalhados)} de{" "}
                        {formatarDuracao(l.totais.minutosPrevistos)} · Faltas {l.totais.faltas}
                        {l.pendencias ? ` · ${l.pendencias} dia(s) incompleto(s)` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Banco de horas</p>
                        <p className="text-sm font-semibold">{formatarSaldo(l.saldoAcumuladoMinutos)}</p>
                      </div>
                      <Badge variant={l.fechado ? "default" : "secondary"}>{l.fechado ? "Fechado" : "Aberto"}</Badge>
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
