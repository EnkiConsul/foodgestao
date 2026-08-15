import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight, FileSpreadsheet, Loader2, Pencil, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/billing";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { tituloSistema } from "@/lib/text/titleCase";
import { useExtratoConciliacao } from "@/hooks/useExtratoConciliacao";
import {
  buildExtratoConciliacao,
  EXTRATO_STATUS_LABEL,
  groupExtratoByDay,
  type ExtratoRow,
  type ExtratoStatusFilter,
} from "@/lib/conciliacao/extrato";
import { downloadXlsx, openPrintable } from "@/lib/relatorios/fluxoCaixaExport";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function KpiCard({
  label,
  value,
  count,
  tone,
  icon,
}: {
  label: string;
  value: string;
  count: number;
  tone: "credito" | "debito" | "alerta" | "neutro";
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md",
              tone === "credito" && "bg-success/15 text-success",
              tone === "debito" && "bg-destructive/15 text-destructive",
              tone === "alerta" && "bg-warning/15 text-warning",
              tone === "neutro" && "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        <div
          className={cn(
            "mt-2 text-lg font-bold tabular-nums sm:text-xl",
            tone === "credito" && "text-success",
            tone === "debito" && "text-destructive",
            tone === "alerta" && count > 0 && "text-destructive",
          )}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground">
          {count} {count === 1 ? "lançamento" : "lançamentos"}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ row }: { row: ExtratoRow }) {
  if (row.conciliado) {
    return <Badge className="bg-success/15 text-success hover:bg-success/15">Conciliado</Badge>;
  }
  return (
    <Badge variant={row.status === "ignored" ? "secondary" : "outline"} className="border-warning/60 text-warning">
      {EXTRATO_STATUS_LABEL[row.status]}
    </Badge>
  );
}

export default function ExtratoConciliacao() {
  const navigate = useNavigate();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const [searchParams] = useSearchParams();

  const accountParam = searchParams.get("account");
  const connectionParam = searchParams.get("connection");

  const [from, setFrom] = useState(searchParams.get("from") ?? isoMonthsAgo(1));
  const [to, setTo] = useState(searchParams.get("to") ?? isoToday());
  const [statusFilter, setStatusFilter] = useState<ExtratoStatusFilter>("all");
  const [pluggyAccountId, setPluggyAccountId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);

  // Resolve o escopo por conta financeira (quando veio da tela da conta)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!accountParam || !selectedCompanyId) {
        setPluggyAccountId(null);
        setAccountName(null);
        return;
      }
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("pluggy_accounts")
        .select("pluggy_account_id, name")
        .eq("company_id", selectedCompanyId)
        .eq("linked_account_id", accountParam)
        .maybeSingle();
      if (!alive) return;
      setPluggyAccountId(data?.pluggy_account_id ?? null);
      setAccountName(data?.name ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [accountParam, selectedCompanyId]);

  const { staging, transactions, loading, error } = useExtratoConciliacao({
    companyId: selectedCompanyId ?? null,
    from,
    to,
    pluggyAccountId,
    connectionId: pluggyAccountId ? null : connectionParam,
  });

  const model = useMemo(
    () => buildExtratoConciliacao({ staging, transactions, statusFilter }),
    [staging, transactions, statusFilter],
  );
  const groups = useMemo(() => groupExtratoByDay(model.rows), [model.rows]);

  const subtitle = `${accountName ? `${accountName} · ` : ""}Período de ${fmtDate(from)} a ${fmtDate(to)}`;

  const openForReconciliation = (stagingId: string) => {
    const params = new URLSearchParams();
    if (accountParam) params.set("account", accountParam);
    params.set("item", stagingId);
    navigate(`/contas-bancarias/conciliacao?${params.toString()}`);
  };

  const editReconciledTransaction = (transactionId: string) => {
    navigate(`/lancamentos?edit=${encodeURIComponent(transactionId)}`);
  };

  const exportRows = () =>
    model.rows.map((r) => [
      fmtDate(r.date),
      r.bankDescription,
      r.amount,
      r.conciliado ? "Conciliado" : EXTRATO_STATUS_LABEL[r.status],
      r.platform?.description ?? "",
      r.platform?.categoryName ?? "",
      r.platform?.contactName ?? "",
      r.platform?.accountName ?? "",
      r.platform?.paymentMethodName ?? "",
      r.platform?.amount ?? null,
    ]);

  const head = [
    "Data",
    "Descrição no banco",
    "Valor no extrato",
    "Situação",
    "Descrição na plataforma",
    "Categoria",
    "Contato",
    "Conta financeira",
    "Forma de pagamento",
    "Valor na plataforma",
  ];

  const notes = () => [
    `Extrato — créditos: ${formatBRL(model.totais.creditos.total)} (${model.totais.creditos.count})`,
    `Extrato — débitos: ${formatBRL(model.totais.debitos.total)} (${model.totais.debitos.count})`,
    `Créditos sem conciliação: ${formatBRL(model.totais.creditosSemConciliacao.total)} (${model.totais.creditosSemConciliacao.count})`,
    `Débitos sem conciliação: ${formatBRL(model.totais.debitosSemConciliacao.total)} (${model.totais.debitosSemConciliacao.count})`,
    `Total do extrato: ${formatBRL(model.totais.totalExtrato)} · Total conciliado: ${formatBRL(model.totais.totalConciliado)} · Diferença: ${formatBRL(model.totais.diferenca)}`,
  ];

  const handlePrint = () => {
    const ok = openPrintable({
      title: tituloSistema("Extrato de Conciliação"),
      subtitle,
      head,
      aligns: ["left", "left", "right", "left", "left", "left", "left", "left", "left", "right"],
      body: exportRows().map((cells) => ({
        cells: cells.map((c, i) =>
          (i === 2 || i === 9) && typeof c === "number" ? formatBRL(c) : String(c ?? ""),
        ),
      })),
      notes: notes(),
      landscape: true,
    });
    if (!ok) toast.error("Permita janelas pop-up para gerar o PDF");
  };

  const handleXlsx = async () => {
    await downloadXlsx(`extrato-conciliacao-${from}-a-${to}.xlsx`, [
      {
        name: "Extrato de Conciliação",
        title: tituloSistema("Extrato de Conciliação"),
        subtitle,
        head,
        rows: exportRows().map((cells) => ({ cells })),
        numericColumns: [2, 9],
        colWidths: [12, 40, 16, 18, 40, 24, 24, 22, 20, 16],
        notes: notes(),
      },
    ]);
  };

  if (contextType !== "pj") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          O extrato de conciliação está disponível apenas no contexto empresa (PJ).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Voltar"
            onClick={() => navigate(accountParam ? `/contas-bancarias/conciliacao?account=${accountParam}` : "/contas-bancarias/conciliacao")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {tituloSistema("Extrato de Conciliação")}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={handlePrint} disabled={loading} className="flex-1 sm:flex-none">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / PDF
          </Button>
          <Button variant="outline" onClick={handleXlsx} disabled={loading} className="flex-1 sm:flex-none">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-3 sm:p-4">
          <div className="space-y-1">
            <Label htmlFor="extrato-from" className="text-xs">Data Inicial</Label>
            <Input id="extrato-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="extrato-to" className="text-xs">Data Final</Label>
            <Input id="extrato-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Situação</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ExtratoStatusFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="conciliados">Conciliados</SelectItem>
                <SelectItem value="sem-conciliacao">Sem conciliação</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Extrato — Créditos"
          value={maskBRL(model.totais.creditos.total)}
          count={model.totais.creditos.count}
          tone="credito"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Extrato — Débitos"
          value={maskBRL(model.totais.debitos.total)}
          count={model.totais.debitos.count}
          tone="debito"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Créditos Sem Conciliação"
          value={maskBRL(model.totais.creditosSemConciliacao.total)}
          count={model.totais.creditosSemConciliacao.count}
          tone="alerta"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Débitos Sem Conciliação"
          value={maskBRL(model.totais.debitosSemConciliacao.total)}
          count={model.totais.debitosSemConciliacao.count}
          tone="alerta"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-3 text-sm sm:grid-cols-3 sm:p-4">
          <div>
            <div className="text-xs text-muted-foreground">Total do Extrato</div>
            <div className="font-semibold tabular-nums">{maskBRL(model.totais.totalExtrato)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Conciliado na Plataforma</div>
            <div className="font-semibold tabular-nums">{maskBRL(model.totais.totalConciliado)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Diferença</div>
            <div
              className={cn(
                "font-semibold tabular-nums",
                Math.abs(model.totais.diferenca) > 0.004 ? "text-destructive" : "text-success",
              )}
            >
              {maskBRL(model.totais.diferenca)}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando extrato...
        </CardContent></Card>
      ) : error ? (
        <Card className="border-destructive/50 bg-destructive/5"><CardContent className="p-6 text-sm">{error}</CardContent></Card>
      ) : model.rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Nenhum lançamento do banco encontrado neste período.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.date}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-xs font-semibold">
                  <span>{fmtDate(g.date)}</span>
                  <span className="tabular-nums">{maskBRL(g.total)}</span>
                </div>
                <div className="divide-y">
                  {g.rows.map((r) => (
                    <div key={r.stagingId} className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4">
                      {/* Lado banco */}
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                          Extrato do banco
                        </div>
                        <div className="truncate text-sm font-medium">{r.bankDescription}</div>
                        <div
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            r.side === "credito" ? "text-success" : "text-destructive",
                          )}
                        >
                          {maskBRL(r.amount)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 md:flex-col">
                        <ArrowLeftRight className="hidden h-4 w-4 text-muted-foreground md:block" aria-hidden />
                        <StatusBadge row={r} />
                      </div>

                      {/* Lado plataforma */}
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                          Lançamento na plataforma
                        </div>
                        {r.platform ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{r.platform.description}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {r.platform.categoryName && (
                                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{r.platform.categoryName}</Badge>
                                )}
                                {r.platform.contactName && (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{r.platform.contactName}</Badge>
                                )}
                                {r.platform.accountName && (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{r.platform.accountName}</Badge>
                                )}
                                {r.platform.paymentMethodName && (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{r.platform.paymentMethodName}</Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0"
                              onClick={() => editReconciledTransaction(r.platform?.id ?? "")}
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              Editar e conciliar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-muted-foreground">
                              {r.status === "ignored" ? "Lançamento ignorado na conciliação" : "Sem lançamento correspondente"}
                            </span>
                            {r.status === "pending" && (
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 shrink-0"
                                onClick={() => openForReconciliation(r.stagingId)}
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                Editar e conciliar
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {model.divergencias.length > 0 && (
            <Card className="border-warning/50">
              <CardContent className="p-3 sm:p-4">
                <div className="mb-2 text-sm font-semibold">
                  Divergências ({model.divergencias.length})
                </div>
                <div className="divide-y">
                  {model.divergencias.map((r) => (
                    <div key={`div-${r.stagingId}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                      <span className="min-w-0 flex-1 truncate">{r.bankDescription}</span>
                      <span className={cn("tabular-nums", r.side === "credito" ? "text-success" : "text-destructive")}>
                        {maskBRL(r.amount)}
                      </span>
                      <StatusBadge row={r} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
