import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  HeartPulse,
  Info,
  Megaphone,
  TrendingDown,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { useAnalyticsCadastro } from "@/hooks/dp/analytics/useAnalyticsCadastro";
import { useAnalyticsEquipe } from "@/hooks/dp/analytics/useAnalyticsEquipe";
import { useAnalyticsOperacao } from "@/hooks/dp/analytics/useAnalyticsOperacao";
import { useAnalyticsAusencias } from "@/hooks/dp/analytics/useAnalyticsAusencias";
import { useAnalyticsFerias } from "@/hooks/dp/analytics/useAnalyticsFerias";
import { useAnalyticsConvocacoes } from "@/hooks/dp/analytics/useAnalyticsConvocacoes";
import { periodoPorMeses, textoVariacao, type PeriodoAnalytics } from "@/lib/dp/analytics/periodo";
import { FILTROS_PADRAO, normalizarFiltros, TODOS, type AnalyticsFiltros } from "@/lib/dp/analytics/filtros";
import { DOW_LABEL, SITUACAO_LABEL, type LinhaOperacao } from "@/lib/dp/analytics/operacao";
import { montarPontosAtencao } from "@/lib/dp/analytics/insights";
import type { ItemDistribuicao } from "@/lib/dp/analytics/equipe";

const PERIODOS = [
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
];

const num = (v: number | null | undefined, sufixo = "") =>
  v === null || v === undefined ? "—" : `${v}${sufixo}`;

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tom = "neutro",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
  tom?: "neutro" | "atencao";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`h-4 w-4 ${tom === "atencao" ? "text-destructive" : "text-primary"}`} />
          {label}
        </div>
        <p className="mt-2 text-2xl font-bold leading-none tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Distribuicao({ titulo, itens, unidade = "pessoas" }: { titulo: string; itens: ItemDistribuicao[]; unidade?: string }) {
  return (
    <DpContentCard contentClassName="p-4 md:p-5">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.chave ?? "sem"} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{i.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {i.total} {unidade} · {i.percentual}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(i.percentual, 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </DpContentCard>
  );
}

function TabelaOperacao({ titulo, linhas, rotulo }: { titulo: string; linhas: LinhaOperacao[]; rotulo: string }) {
  return (
    <DpContentCard contentClassName="p-4 md:p-5">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há histórico suficiente para comparar. São necessários pelo menos 3 dias iguais anteriores.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{rotulo}</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead className="text-right">Equipe média</TableHead>
                <TableHead className="text-right">Habitual</TableHead>
                <TableHead className="text-right">Abaixo do habitual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.chave}>
                  <TableCell className="font-medium">{l.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.diasAnalisados}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(l.equipeMedia)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(l.habitualMedio)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.diasAbaixo} ({l.percentualAbaixo}%)
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DpContentCard>
  );
}

export default function DpAnalytics() {
  const [meses, setMeses] = useState("6");
  const [aba, setAba] = useState("visao");
  const [filtrosBrutos, setFiltros] = useState<AnalyticsFiltros>(FILTROS_PADRAO);

  const periodo: PeriodoAnalytics = useMemo(() => periodoPorMeses(Number(meses)), [meses]);

  const cadastroPreview = useAnalyticsCadastro(FILTROS_PADRAO);
  const filtros = useMemo(
    () => normalizarFiltros(filtrosBrutos, cadastroPreview.setores),
    [filtrosBrutos, cadastroPreview.setores],
  );
  const cadastro = useAnalyticsCadastro(filtros);

  const dimensaoPorId = useMemo(() => {
    const mapa = new Map(
      cadastro.todos.map((c) => [
        c.id,
        { unidade_id: c.unidade_id, cargo_id: c.cargo_id, setor_id: c.setor_id },
      ]),
    );
    return (id: string) => mapa.get(id);
  }, [cadastro.todos]);

  const periodoLabel = `${format(new Date(`${periodo.inicio}T12:00:00`), "MMM/yy", { locale: ptBR })} — ${format(
    new Date(`${periodo.fim}T12:00:00`),
    "MMM/yy",
    { locale: ptBR },
  )}`;

  const equipe = useAnalyticsEquipe({
    colaboradores: cadastro.colaboradores,
    periodo,
    nomes: cadastro.nomes,
  });
  const operacao = useAnalyticsOperacao({
    periodo,
    filtros,
    nomes: cadastro.nomes,
    enabled: aba === "visao" || aba === "operacao",
  });
  const ausencias = useAnalyticsAusencias({
    periodo,
    colabIds: cadastro.colabIds,
    dimensao: dimensaoPorId,
    nomes: cadastro.nomes,
    enabled: aba === "visao" || aba === "ausencias",
  });
  const ferias = useAnalyticsFerias({
    periodo,
    colabIds: cadastro.colabIds,
    dimensao: dimensaoPorId,
    nomes: cadastro.nomes,
    enabled: aba === "visao" || aba === "ferias",
  });
  const convocacoes = useAnalyticsConvocacoes({
    periodo,
    colabIds: cadastro.colabIds,
    dimensao: dimensaoPorId,
    nomes: cadastro.nomes,
    enabled: aba === "visao" || aba === "convocacoes",
  });

  const pontos = useMemo(
    () =>
      montarPontosAtencao({
        periodoLabel,
        operacaoPorDow: operacao.porDiaSemana,
        diasAbaixo: operacao.resumo.abaixo,
        feriasProximasDoPrazo: ferias.kpis.vencendoEm30Dias,
        feriasVencidas: ferias.kpis.vencidos,
        extrasPorDiaSemana: operacao.extras.porDiaSemana,
        aceiteConvocacoes: convocacoes.kpis.aceite,
        aceiteConvocacoesAnterior: convocacoes.kpis.aceiteAnterior,
        ocorrenciasConfirmadas: ausencias.ocorrencias.confirmadas,
        ocorrenciasAnteriores: ausencias.ocorrenciasAnterior.confirmadas,
        diasAfastamento: ausencias.diasAfastamento,
        diasAfastamentoAnterior: ausencias.diasAfastamentoAnterior,
        diasFeriasAbaixo: operacao.dias.filter(
          (d) => d.situacao === "abaixo" && ferias.diasComFerias.has(d.data),
        ).length,
      }),
    [periodoLabel, operacao, ferias, convocacoes, ausencias],
  );

  const setPeriodoFiltro = (patch: Partial<AnalyticsFiltros>) =>
    setFiltros((atual) => ({ ...atual, ...patch }));

  if (cadastro.isError) {
    return (
      <DpPage>
        <DpPageHeader icon={BarChart3} title="Analytics" description="Indicadores de pessoas e operação." />
        <DpErrorState onRetry={cadastro.refetch} />
      </DpPage>
    );
  }

  return (
    <DpPage>
      <Helmet>
        <title>Analytics de pessoas e operação — Pessoas 360°</title>
        <meta
          name="description"
          content="Quadro, entradas e saídas, operação do dia, ausências, férias e convocações em um só painel."
        />
      </Helmet>

      <DpPageHeader
        icon={BarChart3}
        title="Analytics"
        description="Quadro, operação, ausências, férias e convocações. Sem valores de folha."
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <Select value={meses} onValueChange={setMeses}>
              <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select
              value={filtros.unidade}
              onValueChange={(v) => setPeriodoFiltro({ unidade: v, setor: TODOS })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as unidades</SelectItem>
                {cadastro.unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cargo</Label>
            <Select value={filtros.cargo} onValueChange={(v) => setPeriodoFiltro({ cargo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os cargos</SelectItem>
                {cadastro.cargos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cadastro.usaSetores && (
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              <Select value={filtros.setor} onValueChange={(v) => setPeriodoFiltro({ setor: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os setores</SelectItem>
                  {cadastro.setoresDoFiltro.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Vínculo</Label>
            <Select value={filtros.vinculo} onValueChange={(v) => setPeriodoFiltro({ vinculo: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os vínculos</SelectItem>
                {cadastro.vinculos.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {periodoLabel} · {cadastro.colaboradores.length} pessoas no recorte
        </p>
      </DpFilterCard>

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="operacao">Operação</TabsTrigger>
          <TabsTrigger value="ausencias">Ausências</TabsTrigger>
          <TabsTrigger value="ferias">Férias</TabsTrigger>
          <TabsTrigger value="convocacoes">Convocações</TabsTrigger>
        </TabsList>

        {/* ---------------- Visão geral ---------------- */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Users}
              label="Pessoas no quadro"
              value={String(equipe.kpis.headcountAtual)}
              hint={`Média de ${equipe.kpis.headcountMedio} no período`}
            />
            <Kpi
              icon={TrendingDown}
              label="Rotatividade"
              value={`${equipe.kpis.turnover}%`}
              hint={textoVariacao(equipe.kpis.turnoverVariacao, { pp: true })}
            />
            <Kpi
              icon={CalendarCheck}
              label="Dias abaixo do habitual"
              value={String(operacao.resumo.abaixo)}
              hint={`De ${operacao.resumo.analisados} dias comparáveis`}
              tom={operacao.resumo.abaixo > 0 ? "atencao" : "neutro"}
            />
            <Kpi
              icon={HeartPulse}
              label="Dias de atestado"
              value={String(ausencias.diasAfastamento)}
              hint={`${ausencias.atestados.colaboradores} ${
                ausencias.atestados.colaboradores === 1 ? "pessoa" : "pessoas"
              }`}
            />
          </div>

          <DpContentCard contentClassName="p-4 md:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-primary" /> Pontos de atenção
            </h2>
            {pontos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada fora do padrão no período analisado.
              </p>
            ) : (
              <ul className="space-y-2">
                {pontos.map((p) => (
                  <li key={p.id} className="rounded-lg border p-3">
                    <p className="text-sm">{p.texto}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="h-3 w-3" /> {p.origem}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Os textos descrevem apenas o que os registros mostram no período — não indicam causa.
            </p>
          </DpContentCard>
        </TabsContent>

        {/* ---------------- Equipe ---------------- */}
        <TabsContent value="equipe" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Users} label="Pessoas no quadro" value={String(equipe.kpis.headcountAtual)} />
            <Kpi icon={UserPlus} label="Entradas" value={String(equipe.kpis.admissoes)} />
            <Kpi icon={UserMinus} label="Saídas" value={String(equipe.kpis.desligamentos)} />
            <Kpi
              icon={TrendingDown}
              label="Rotatividade"
              value={`${equipe.kpis.turnover}%`}
              hint={textoVariacao(equipe.kpis.turnoverVariacao, { pp: true })}
            />
          </div>

          <DpContentCard contentClassName="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold">Quadro, entradas e saídas por mês</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equipe.serie}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="headcount" name="No quadro" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="admissoes" name="Entradas" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                  <Line type="monotone" dataKey="desligamentos" name="Saídas" stroke="hsl(var(--destructive))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </DpContentCard>

          <DpContentCard contentClassName="p-4 md:p-5">
            <h2 className="mb-1 text-sm font-semibold">Tempo de casa de quem saiu</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {equipe.permanencia.considerados} de {equipe.permanencia.totalDesligados} saídas com data de
              admissão registrada. {equipe.permanencia.ate90Dias} saíram com até 90 dias de casa.
            </p>
            {equipe.permanencia.considerados === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma saída no período.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {equipe.permanencia.faixas.map((f) => (
                  <li key={f.faixa} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{f.faixa}</span>
                    <span className="font-semibold tabular-nums">{f.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </DpContentCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <Distribuicao titulo="Pessoas por unidade" itens={equipe.porUnidade} />
            <Distribuicao titulo="Pessoas por cargo" itens={equipe.porCargo} />
            {cadastro.usaSetores && <Distribuicao titulo="Pessoas por setor" itens={equipe.porSetor} />}
            <Distribuicao titulo="Pessoas por vínculo" itens={equipe.porVinculo} />
            <Distribuicao titulo="Motivos de saída" itens={equipe.motivos} unidade="saídas" />
          </div>
        </TabsContent>

        {/* ---------------- Operação ---------------- */}
        <TabsContent value="operacao" className="space-y-4">
          {operacao.isError ? (
            <DpErrorState onRetry={operacao.refetch} />
          ) : operacao.isLoading ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Comparando os dias com o padrão histórico…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  icon={CalendarCheck}
                  label={SITUACAO_LABEL.ok}
                  value={String(operacao.resumo.dentro)}
                  hint={`De ${operacao.resumo.analisados} dias comparáveis`}
                />
                <Kpi
                  icon={TrendingDown}
                  label={SITUACAO_LABEL.abaixo}
                  value={String(operacao.resumo.abaixo)}
                  tom={operacao.resumo.abaixo > 0 ? "atencao" : "neutro"}
                />
                <Kpi icon={Users} label={SITUACAO_LABEL.acima} value={String(operacao.resumo.acima)} />
                <Kpi
                  icon={Info}
                  label={SITUACAO_LABEL.sem_padrao}
                  value={String(operacao.resumo.semHistorico)}
                  hint="Menos de 3 dias iguais no histórico"
                />
              </div>

              <TabelaOperacao titulo="Situação por dia da semana" linhas={operacao.porDiaSemana} rotulo="Dia da semana" />
              <TabelaOperacao titulo="Situação por cargo" linhas={operacao.porCargo} rotulo="Cargo" />
              {cadastro.usaSetores && (
                <TabelaOperacao titulo="Situação por setor" linhas={operacao.porSetor} rotulo="Setor" />
              )}

              <DpContentCard contentClassName="p-4 md:p-5">
                <h2 className="mb-1 text-sm font-semibold">Mão de obra extra</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Pessoas de teste e folguistas registradas na rotina. Quem já é do quadro não entra aqui.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi icon={Users} label="Utilizações" value={String(operacao.extras.utilizacoes)} />
                  <Kpi icon={CalendarDays} label="Dias com uso" value={String(operacao.extras.diasComExtra)} />
                  <Kpi
                    icon={Info}
                    label="Média por dia com uso"
                    value={num(operacao.extras.mediaPorDiaComUso)}
                  />
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={operacao.extras.porDiaSemana.map((total, dow) => ({
                        label: DOW_LABEL[dow],
                        total,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="total" name="Utilizações" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </DpContentCard>
            </>
          )}
        </TabsContent>

        {/* ---------------- Ausências ---------------- */}
        <TabsContent value="ausencias" className="space-y-4">
          {ausencias.isError ? (
            <DpErrorState onRetry={ausencias.refetch} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  icon={HeartPulse}
                  label="Dias de atestado"
                  value={String(ausencias.diasAfastamento)}
                  hint={`${ausencias.atestados.ocorrencias} atestados · ${ausencias.atestados.colaboradores} ${
                    ausencias.atestados.colaboradores === 1 ? "pessoa" : "pessoas"
                  }`}
                />
                <Kpi
                  icon={CalendarDays}
                  label="Folgas registradas"
                  value={String(ausencias.folgas.efetivas)}
                  hint={`${ausencias.folgas.automaticas} automáticas · ${ausencias.folgas.excecoesDeJanela} exceções`}
                />
                <Kpi
                  icon={Info}
                  label="Solicitações recebidas"
                  value={String(ausencias.solicitacoes.recebidas)}
                  hint={`${ausencias.solicitacoes.pendentes} pendentes · resposta em ${num(
                    ausencias.solicitacoes.medianaHorasDecisao,
                  )} h`}
                />
                <Kpi
                  icon={AlertTriangle}
                  label="Ocorrências confirmadas"
                  value={String(ausencias.ocorrencias.confirmadas)}
                  hint={`${ausencias.ocorrencias.comDuasOuMais} pessoas com 2 ou mais`}
                />
              </div>

              <DpContentCard contentClassName="p-4 md:p-5">
                <h2 className="mb-3 text-sm font-semibold">Folgas por dia da semana</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ausencias.folgas.porDiaSemana.map((total, dow) => ({ label: DOW_LABEL[dow], total }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="total" name="Folgas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </DpContentCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <DpContentCard contentClassName="p-4 md:p-5">
                  <h2 className="mb-3 text-sm font-semibold">Dias de atestado por unidade</h2>
                  {ausencias.atestadoPorUnidade.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem atestados no período.</p>
                  ) : (
                    <ul className="space-y-2">
                      {ausencias.atestadoPorUnidade.map((i) => (
                        <li key={i.chave ?? "sem"} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="truncate">{i.label}</span>
                          <span className="font-semibold tabular-nums">{i.dias} dias</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DpContentCard>

                <DpContentCard contentClassName="p-4 md:p-5">
                  <h2 className="mb-3 text-sm font-semibold">Solicitações por tipo</h2>
                  {ausencias.solicitacoes.porTipo.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma solicitação no período.</p>
                  ) : (
                    <ul className="space-y-2">
                      {ausencias.solicitacoes.porTipo.map((t) => (
                        <li key={t.tipo} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="capitalize">{t.tipo}</span>
                          <span className="font-semibold tabular-nums">{t.total}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DpContentCard>

                <DpContentCard contentClassName="p-4 md:p-5">
                  <h2 className="mb-3 text-sm font-semibold">Ocorrências por tipo</h2>
                  {ausencias.ocorrencias.porTipo.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma ocorrência confirmada no período.</p>
                  ) : (
                    <ul className="space-y-2">
                      {ausencias.ocorrencias.porTipo.map((t) => (
                        <li key={t.tipo} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="capitalize">{t.tipo.replace(/_/g, " ")}</span>
                          <span className="font-semibold tabular-nums">{t.total}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DpContentCard>

                {ausencias.disciplinarDisponivel && (
                  <DpContentCard contentClassName="p-4 md:p-5">
                    <h2 className="mb-1 text-sm font-semibold">Registros disciplinares</h2>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {ausencias.disciplinarTotal} registros no período.
                    </p>
                    {ausencias.disciplinarPorTipo.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum registro no período.</p>
                    ) : (
                      <ul className="space-y-2">
                        {ausencias.disciplinarPorTipo.map((t) => (
                          <li key={t.chave ?? "sem"} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span className="capitalize">{t.label.replace(/_/g, " ")}</span>
                            <span className="font-semibold tabular-nums">{t.total}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </DpContentCard>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------------- Férias ---------------- */}
        <TabsContent value="ferias" className="space-y-4">
          {ferias.isError ? (
            <DpErrorState onRetry={ferias.refetch} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  icon={CalendarDays}
                  label="Períodos com saldo"
                  value={String(ferias.kpis.periodosComSaldo)}
                  hint={`${ferias.kpis.aProgramar} ainda sem programação`}
                />
                <Kpi
                  icon={AlertTriangle}
                  label="Prazo vencendo em 30 dias"
                  value={String(ferias.kpis.vencendoEm30Dias)}
                  tom={ferias.kpis.vencendoEm30Dias > 0 ? "atencao" : "neutro"}
                />
                <Kpi
                  icon={AlertTriangle}
                  label="Prazo vencido"
                  value={String(ferias.kpis.vencidos)}
                  tom={ferias.kpis.vencidos > 0 ? "atencao" : "neutro"}
                />
                <Kpi
                  icon={Users}
                  label="De férias hoje"
                  value={String(ferias.kpis.emFeriasHoje)}
                  hint={`${ferias.kpis.solicitacoesPendentes} pedidos aguardando resposta`}
                />
              </div>

              <DpContentCard contentClassName="p-4 md:p-5">
                <h2 className="mb-3 text-sm font-semibold">Pessoas de férias por mês</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ferias.porMes}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="pessoas" name="Pessoas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </DpContentCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <Distribuicao titulo="Férias por unidade" itens={ferias.porUnidade} unidade="períodos" />
                <Distribuicao titulo="Férias por cargo" itens={ferias.porCargo} unidade="períodos" />
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------------- Convocações ---------------- */}
        <TabsContent value="convocacoes" className="space-y-4">
          {convocacoes.isError ? (
            <DpErrorState onRetry={convocacoes.refetch} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi icon={Megaphone} label="Convocações enviadas" value={String(convocacoes.kpis.enviadas)} />
                <Kpi
                  icon={CalendarCheck}
                  label="Taxa de aceite"
                  value={convocacoes.kpis.aceite === null ? "—" : `${convocacoes.kpis.aceite}%`}
                  hint={`${convocacoes.kpis.aceitas} aceitas · ${convocacoes.kpis.recusadas} recusadas`}
                />
                <Kpi
                  icon={Info}
                  label="Sem resposta"
                  value={String(convocacoes.kpis.semResposta)}
                  tom={convocacoes.kpis.semResposta > 0 ? "atencao" : "neutro"}
                />
                <Kpi
                  icon={CalendarDays}
                  label="Tempo médio de resposta"
                  value={num(convocacoes.kpis.mediaHorasResposta, " h")}
                />
              </div>

              <DpContentCard contentClassName="p-4 md:p-5">
                <h2 className="mb-3 text-sm font-semibold">Convocações por mês</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={convocacoes.porMes}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="enviadas" name="Enviadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </DpContentCard>

              <DpContentCard contentClassName="p-4 md:p-5">
                <h2 className="mb-3 text-sm font-semibold">Aceite por unidade</h2>
                {convocacoes.porUnidade.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma convocação no período.</p>
                ) : (
                  <ul className="space-y-2">
                    {convocacoes.porUnidade.map((u) => (
                      <li key={u.chave ?? "sem"} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span className="truncate">{u.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge variant="secondary">{u.enviadas} enviadas</Badge>
                          <span className="font-semibold tabular-nums">
                            {u.aceite === null ? "—" : `${u.aceite}%`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DpContentCard>
            </>
          )}
        </TabsContent>
      </Tabs>
    </DpPage>
  );
}
