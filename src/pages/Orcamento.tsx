import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { applyFinancialScope, assertFinancialScope, isFinancialScopeReady } from "@/lib/financialScope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BudgetFormDialog } from "@/components/budgets/BudgetFormDialog";
import { Plus, Target, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

import { formatBRL as formatBRLRaw } from "@/lib/billing";

function getAlertLevel(percent: number, alerts: { a70: boolean; a90: boolean; a100: boolean }) {
  if (percent >= 100 && alerts.a100) return { label: "Estourado", color: "destructive" as const };
  if (percent >= 90 && alerts.a90) return { label: "Crítico", color: "destructive" as const };
  if (percent >= 70 && alerts.a70) return { label: "Atenção", color: "outline" as const };
  return null;
}

export default function Orcamento() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const formatBRL = maskBRL;
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sincronização em tempo real (orçamento depende de transações de despesa)
  useRealtimeSync({
    tables: ["transactions"],
    invalidateKeyPrefixes: ["budgets", "budget-spending"],
  });

  const { data: budgets = [], refetch } = useQuery({
    queryKey: ["budgets", user?.id, contextType, selectedCompanyId],
    enabled: !!user && isFinancialScopeReady(contextType, user?.id, selectedCompanyId),
    queryFn: async () => {
      const scope = assertFinancialScope({ context: contextType, userId: user!.id, companyId: selectedCompanyId });
      const q = applyFinancialScope(
        supabase
          .from("budgets")
          .select("*, categories!fk_budgets_category(name, color, icon)"),
        scope,
      ).order("created_at", { ascending: false });
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fetch spending per category for current month
  const { data: spending = {} } = useQuery({
    queryKey: ["budget-spending", user?.id, contextType, selectedCompanyId],
    enabled: !!user && isFinancialScopeReady(contextType, user?.id, selectedCompanyId),
    queryFn: async () => {
      const scope = assertFinancialScope({ context: contextType, userId: user!.id, companyId: selectedCompanyId });
      const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const end = format(endOfMonth(new Date()), "yyyy-MM-dd");
      const q = applyFinancialScope(
        supabase
          .from("transactions")
          .select("amount, category_id"),
        scope,
      )
        .eq("transaction_type", "saida")
        .neq("status", "cancelado")
        .gte("transaction_date", start)
        .lte("transaction_date", end);

      const { data } = await q;
      const map: Record<string, number> = {};
      for (const t of data ?? []) {
        if (t.category_id) {
          map[t.category_id] = (map[t.category_id] ?? 0) + Number(t.amount);
        }
      }
      return map;
    },
  });

  const handleDelete = async (id: string) => {
    // A RLS é a proteção final; adicionamos escopo redundante para defesa em profundidade.
    let query = supabase.from("budgets").delete().eq("id", id);
    if (contextType === "pj" && selectedCompanyId) {
      query = query.eq("company_id", selectedCompanyId);
    } else {
      query = query.eq("user_id", user!.id).is("company_id", null);
    }
    const { error } = await query;
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Orçamento excluído"); refetch(); }
  };


  const stats = useMemo(() => {
    let totalBudget = 0;
    let totalSpent = 0;
    let alertCount = 0;

    for (const b of budgets) {
      totalBudget += Number(b.amount);
      const spent = spending[b.category_id] ?? 0;
      totalSpent += spent;
      const pct = (spent / Number(b.amount)) * 100;
      if (pct >= 70) alertCount++;
    }

    return { totalBudget, totalSpent, alertCount, count: budgets.length };
  }, [budgets, spending]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Orçamento</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Planeje e Acompanhe seus Limites por Categoria</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Novo Orçamento
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Orçado</p>
            <p className="text-sm font-bold">{formatBRL(stats.totalBudget)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Gasto</p>
            <p className={`text-sm font-bold ${stats.totalSpent > stats.totalBudget ? "text-destructive" : "text-success"}`}>
              {formatBRL(stats.totalSpent)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Alertas</p>
            <p className={`text-sm font-bold ${stats.alertCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {stats.alertCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget cards */}
      <div className="space-y-3">
        {budgets.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <Target className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhum orçamento criado</p>
              <Button variant="link" onClick={() => setDialogOpen(true)} className="mt-2">
                Criar primeiro orçamento
              </Button>
            </CardContent>
          </Card>
        ) : (
          budgets.map((b) => {
            const cat = b.categories as { name: string; color: string | null; icon: string | null } | null;
            const spent = spending[b.category_id] ?? 0;
            const limit = Number(b.amount);
            const percent = limit > 0 ? Math.min((spent / limit) * 100, 120) : 0;
            const remaining = limit - spent;
            const alert = getAlertLevel(percent, {
              a70: b.alert_threshold_70,
              a90: b.alert_threshold_90,
              a100: b.alert_threshold_100,
            });

            const progressColor =
              percent >= 100
                ? "bg-destructive"
                : percent >= 90
                  ? "bg-destructive"
                  : percent >= 70
                    ? "bg-warning"
                    : "bg-success";

            return (
              <Card key={b.id} className="shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat?.color ?? "hsl(var(--primary))" }}
                      />
                      <span className="font-medium text-sm truncate">{cat?.name ?? "Categoria"}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {b.period === "mensal" ? "Mensal" : "Anual"}
                      </Badge>
                      {alert && (
                        <Badge variant={alert.color} className="text-[10px] h-4 px-1.5 gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {alert.label}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 sm:h-7 sm:w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDelete(b.id)}
                      aria-label="Excluir orçamento"
                    >
                      <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </Button>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatBRL(spent)} gasto</span>
                      <span>{formatBRL(limit)} limite</span>
                    </div>
                    <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressColor}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                      {/* Threshold markers */}
                      {b.alert_threshold_70 && (
                        <div className="absolute top-0 h-full w-px bg-foreground/20" style={{ left: "70%" }} />
                      )}
                      {b.alert_threshold_90 && (
                        <div className="absolute top-0 h-full w-px bg-foreground/30" style={{ left: "90%" }} />
                      )}
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{percent.toFixed(0)}% usado</span>
                      <span className={remaining >= 0 ? "text-success" : "text-destructive"}>
                        {remaining >= 0 ? `Sobra ${formatBRL(remaining)}` : `Excedido ${formatBRL(Math.abs(remaining))}`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <BudgetFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => refetch()} />
    </div>
  );
}
