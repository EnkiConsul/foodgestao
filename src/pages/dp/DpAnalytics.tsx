import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, Download, TrendingDown, Users, HeartPulse, Wallet } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useDpAnalytics } from "@/hooks/useDpAnalytics";
import { MOTIVO_DESLIGAMENTO_LABEL } from "@/lib/dp/desligamento";
import type { Database } from "@/integrations/supabase/types";
import { DpErrorState } from "@/components/dp/DpErrorState";

type MotivoDesligamento = Database["public"]["Enums"]["dp_motivo_desligamento"];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const PERIODOS = [
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
];

function Kpi({
  icon: Icon, label, value, hint,
}: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </div>
        <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function DpAnalytics() {
  const [meses, setMeses] = useState("6");
  const [unidade, setUnidade] = useState("todas");

  const range = useMemo(() => {
    const fim = endOfMonth(new Date());
    const inicio = startOfMonth(subMonths(fim, Number(meses) - 1));
    return { inicio: format(inicio, "yyyy-MM-dd"), fim: format(fim, "yyyy-MM-dd") };
  }, [meses]);

  const { isLoading, isError, refetchAll, unidades, serie, porUnidade, motivos, kpis } =
    useDpAnalytics(range, unidade);

  const exportCSV = () => {
    const headers = ["Competência", "Headcount", "Admissões", "Desligamentos", "Turnover (%)", "Custo folha"];
    const linhas = serie.map((m) => [
      m.competencia, m.headcount, m.admissoes, m.desligamentos,
      String(m.turnover).replace(".", ","), m.custo.toFixed(2).replace(".", ","),
    ]);
    const unidadeHeaders = ["Unidade", "Headcount", "Desligamentos", "Folgas", "Atestados", "Custo folha"];
    const unidadeLinhas = porUnidade.map((u) => [
      `"${u.nome.replace(/"/g, '""')}"`, u.headcount, u.desligamentos, u.folgas, u.atestados,
      u.custo.toFixed(2).replace(".", ","),
    ]);
    const csv = [
      headers.join(";"),
      ...linhas.map((l) => l.join(";")),
      "",
      unidadeHeaders.join(";"),
      ...unidadeLinhas.map((l) => l.join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dp_analytics_${range.inicio}_${range.fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DpPage>
      <Helmet>
        <title>Analytics de RH — Pessoas 360°</title>
        <meta name="description" content="Indicadores de headcount, turnover, absenteísmo e custo de folha por unidade." />
      </Helmet>

      <DpPageHeader
        icon={BarChart3}
        title="Analytics de RH"
        description="Headcount, turnover, absenteísmo, custo de folha e distribuição de folgas."
        actions={
          <Button variant="outline" onClick={exportCSV} disabled={isLoading || serie.length === 0}>
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <Select value={meses} onValueChange={setMeses}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex items-end text-xs text-muted-foreground">
            {format(new Date(range.inicio), "MMMM 'de' yyyy", { locale: ptBR })} —{" "}
            {format(new Date(range.fim), "MMMM 'de' yyyy", { locale: ptBR })}
          </div>
        </div>
      </DpFilterCard>

      {isError ? (
        <DpErrorState onRetry={refetchAll} />
      ) : isLoading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Calculando indicadores…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Users} label="Headcount atual" value={String(kpis.headcountAtual)}
              hint={`${kpis.totalAdmissoes} admissões no período`} />
            <Kpi icon={TrendingDown} label="Turnover médio" value={`${kpis.turnoverMedio}%`}
              hint={`${kpis.totalDesligamentos} desligamentos`} />
            <Kpi icon={HeartPulse} label="Absenteísmo" value={`${kpis.absenteismo}%`}
              hint={`${kpis.diasAtestado} dias de atestado`} />
            <Kpi icon={Wallet} label="Custo de folha" value={brl(kpis.custoTotal)}
              hint={`${brl(kpis.custoMedioColaborador)} por colaborador`} />
          </div>

          <DpContentCard contentClassName="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold">Headcount e movimentação</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="headcount" name="Headcount" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="admissoes" name="Admissões" stroke="hsl(var(--chart-2, var(--muted-foreground)))" strokeWidth={2} />
                  <Line type="monotone" dataKey="desligamentos" name="Desligamentos" stroke="hsl(var(--destructive))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </DpContentCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <DpContentCard contentClassName="p-4 md:p-5">
              <h2 className="mb-3 text-sm font-semibold">Turnover mensal (%)</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="turnover" name="Turnover" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DpContentCard>

            <DpContentCard contentClassName="p-4 md:p-5">
              <h2 className="mb-3 text-sm font-semibold">Custo de folha por mês</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => brl(Number(v))} width={80} />
                    <Tooltip formatter={(v: number) => brl(Number(v))} />
                    <Bar dataKey="custo" name="Custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DpContentCard>
          </div>

          <DpContentCard contentClassName="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold">Resumo por unidade</h2>
            {/* Mobile: cards sem rolagem lateral */}
            <div className="space-y-2 md:hidden">
              {porUnidade.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : porUnidade.map((u) => (
                <div key={u.unidade_id ?? "sem"} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm truncate">{u.nome}</span>
                    <span className="text-sm font-bold tabular-nums shrink-0">{brl(u.custo)}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><dt>Headcount</dt><dd className="tabular-nums text-foreground">{u.headcount}</dd></div>
                    <div className="flex justify-between"><dt>Deslig.</dt><dd className="tabular-nums text-foreground">{u.desligamentos}</dd></div>
                    <div className="flex justify-between"><dt>Folgas</dt><dd className="tabular-nums text-foreground">{u.folgas}</dd></div>
                    <div className="flex justify-between"><dt>Atestados</dt><dd className="tabular-nums text-foreground">{u.atestados}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Headcount</TableHead>
                    <TableHead className="text-right">Desligamentos</TableHead>
                    <TableHead className="text-right">Folgas</TableHead>
                    <TableHead className="text-right">Atestados</TableHead>
                    <TableHead className="text-right">Custo folha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porUnidade.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        Sem dados no período.
                      </TableCell>
                    </TableRow>
                  ) : porUnidade.map((u) => (
                    <TableRow key={u.unidade_id ?? "sem"}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell className="text-right">{u.headcount}</TableCell>
                      <TableCell className="text-right">{u.desligamentos}</TableCell>
                      <TableCell className="text-right">{u.folgas}</TableCell>
                      <TableCell className="text-right">{u.atestados}</TableCell>
                      <TableCell className="text-right">{brl(u.custo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DpContentCard>

          <DpContentCard contentClassName="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold">Motivos de desligamento</h2>
            {motivos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum desligamento no período.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {motivos.map((m) => (
                  <li key={m.motivo} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{MOTIVO_DESLIGAMENTO_LABEL[m.motivo as MotivoDesligamento] ?? m.motivo}</span>
                    <span className="font-semibold">{m.total}</span>
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
