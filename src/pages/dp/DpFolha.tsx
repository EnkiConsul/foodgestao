import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { BarChart3, Calculator, FileSignature, Gift, Receipt } from "lucide-react";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useDpFolhaPeriodos } from "@/hooks/useDpFolha";
import { FOLHA_TIPO_LABEL, PERIODO_STATUS_LABEL, type FolhaPeriodoStatus } from "@/lib/dp/folha";

const rotuloCompetencia = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function DpFolha() {
  const { periodos, isLoading, error } = useDpFolhaPeriodos();
  const [status, setStatus] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const lista = useMemo(
    () =>
      periodos.filter(
        (p) =>
          (status === "todos" || p.status === status) &&
          (!busca.trim() || rotuloCompetencia(p.competencia).toLowerCase().includes(busca.trim().toLowerCase())),
      ),
    [periodos, status, busca],
  );

  if (error) return <DpErrorState message="Não foi possível carregar os períodos da folha." />;

  return (
    <DpPage>
      <Helmet>
        <title>Folha de Pagamento | Pessoas Aveto 360</title>
        <meta name="description" content="Períodos da folha de pagamento por competência, com status do ciclo de aprovação." />
      </Helmet>

      <DpPageHeader
        title="Folha de Pagamento"
        description="Períodos gerados pela apuração do ponto e seu ciclo de aprovação."
        icon={Receipt}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dp/folha/relatorios">
                <BarChart3 className="mr-2 h-4 w-4" />
                Relatórios
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dp/folha/provisoes">
                <Gift className="mr-2 h-4 w-4" />
                Férias e 13º
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dp/rescisoes">
                <FileSignature className="mr-2 h-4 w-4" />
                Rescisões
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dp/ponto/apuracao">
                <Calculator className="mr-2 h-4 w-4" />
                Apuração do Ponto
              </Link>
            </Button>
          </div>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {(Object.keys(PERIODO_STATUS_LABEL) as FolhaPeriodoStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{PERIODO_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="busca-competencia">Competência</Label>
            <Input
              id="busca-competencia"
              placeholder="Ex.: julho"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </DpFilterCard>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DpContentCard className="p-0">
          {!lista.length ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum período encontrado. Gere os lançamentos a partir da apuração do ponto.
            </p>
          ) : (
            <ul className="divide-y">
              {lista.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/dp/folha/${p.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium first-letter:uppercase">{rotuloCompetencia(p.competencia)}</p>
                      <p className="text-xs text-muted-foreground">
                        {FOLHA_TIPO_LABEL[p.tipo] ?? p.tipo} · {p.totalLancamentos} lançamento(s)
                        {p.data_pagamento
                          ? ` · pagamento em ${new Date(`${p.data_pagamento}T12:00:00`).toLocaleDateString("pt-BR")}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={p.status === "pago" ? "default" : "secondary"}>
                      {PERIODO_STATUS_LABEL[p.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DpContentCard>
      )}
    </DpPage>
  );
}
