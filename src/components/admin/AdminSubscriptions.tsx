import { useState, useMemo } from "react";
import { useAdminSubscriptions, useUpdateSubscription, useRemoveExemption } from "@/hooks/useBilling";
import { usePlans } from "@/hooks/usePlans";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date-utils";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_VARIANT,
  isExempt,
  exemptionLabel,
} from "@/lib/billing";
import { useUserNames } from "@/hooks/useUserNames";
import { ExemptSubscriptionDialog } from "./ExemptSubscriptionDialog";
import { ClientCell } from "./ClientCell";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

/** Test/seed accounts and collaborator portal logins pollute the list. */
const SEED_ID_PREFIXES = ["11111111-", "22222222-", "33333333-", "44444444-", "55555555-"];
function isNoiseAccount(userId?: string | null, name?: string | null) {
  if (!userId) return false;
  if (SEED_ID_PREFIXES.some((p) => userId.startsWith(p))) return true;
  const n = (name ?? "").toLowerCase();
  if (!n) return false;
  return (
    n.includes("@portal.360food.local") ||
    n.startsWith("e2e-") ||
    n.includes("@example.com") ||
    n.includes("teste analytics")
  );
}

export function AdminSubscriptions() {
  const { data: subs = [], isLoading } = useAdminSubscriptions();
  const { data: plans = [] } = usePlans();
  const { displayName, realName } = useUserNames();
  
  const update = useUpdateSubscription();
  const removeExemption = useRemoveExemption();
  const [filter, setFilter] = useState<string>("all");
  const [hideTest, setHideTest] = useState(true);
  const [clientSortDir, setClientSortDir] = useState<"asc" | "desc" | null>(null);
  const [exemptTarget, setExemptTarget] = useState<{ id: string; planId: string } | null>(null);

  const byStatus = filter === "all" ? subs : subs.filter((s: any) => s.status === filter);
  const noiseCount = useMemo(
    () => byStatus.filter((s: any) => isNoiseAccount(s.user_id, realName(s.user_id))).length,
    [byStatus, realName]
  );
  const filtered = useMemo(
    () => (hideTest ? byStatus.filter((s: any) => !isNoiseAccount(s.user_id, realName(s.user_id))) : byStatus),
    [byStatus, hideTest, realName]
  );

  const activePlanIds = useMemo(
    () => new Set(plans.filter((p: any) => p.is_active).map((p: any) => p.id)),
    [plans]
  );
  const planLabel = (p: any) => (p.is_active ? p.name : `${p.name} (inativo)`);

  const sortedFiltered = useMemo(() => {
    if (!clientSortDir) return filtered;
    const key = (s: any) => {
      const name = displayName(s.user_id);
      return name || s.user_id?.slice(0, 8) || "";
    };
    return [...filtered].sort((a, b) => {
      const cmp = key(a).localeCompare(key(b), "pt-BR", { sensitivity: "base" });
      return clientSortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, clientSortDir, displayName]);

  const toggleClientSort = () => {
    setClientSortDir((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} assinaturas</p>
        {noiseCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setHideTest((v) => !v)}>
            {hideTest ? `Mostrar contas de teste (${noiseCount})` : "Ocultar contas de teste"}
          </Button>
        )}
      </div>


      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={toggleClientSort}>
                <span className="inline-flex items-center gap-1">
                  Cliente
                  {clientSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : clientSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                </span>
              </TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Isenção</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Vence em</TableHead>
              <TableHead>Trial até</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma assinatura</TableCell></TableRow>
            ) : (
              sortedFiltered.map((s: any) => {
                const exempt = isExempt(s);
                return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <ClientCell userId={s.user_id} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={s.plan_id}
                      onValueChange={(plan_id) => update.mutate({ id: s.id, plan_id })}
                    >
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={SUBSCRIPTION_STATUS_VARIANT[s.status]}>
                      {SUBSCRIPTION_STATUS_LABELS[s.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {exempt ? (
                      <Badge variant="secondary">{exemptionLabel(s)}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(s.started_at, "dd/MM/yy")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(s.current_period_end, "dd/MM/yy")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(s.trial_ends_at, "dd/MM/yy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {s.status !== "canceled" && !exempt && (
                        <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({ id: s.id, status: "canceled", canceled_at: new Date().toISOString() })}>
                          Cancelar
                        </Button>
                      )}
                      {s.status === "canceled" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => update.mutate({ id: s.id, status: "active", canceled_at: null })}>
                          Reativar
                        </Button>
                      )}
                      {s.status === "trialing" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => {
                            const cur = s.trial_ends_at ? new Date(s.trial_ends_at) : new Date();
                            cur.setDate(cur.getDate() + 7);
                            update.mutate({ id: s.id, trial_ends_at: cur.toISOString() });
                          }}>
                          +7d trial
                        </Button>
                      )}
                      {exempt ? (
                        <Button size="sm" variant="ghost"
                          onClick={() => {
                            if (confirm("Remover isenção? O cliente voltará ao fluxo normal de cobrança.")) {
                              removeExemption.mutate(s.id);
                            }
                          }}>
                          Remover isenção
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost"
                          onClick={() => setExemptTarget({ id: s.id, planId: s.plan_id })}>
                          Isentar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );})
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3"><Skeleton className="h-20 w-full" /></div>
          ))
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma assinatura</p>
        ) : (
          sortedFiltered.map((s: any) => {
            const exempt = isExempt(s);
            return (
              <div key={s.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm font-medium truncate">
                    <ClientCell userId={s.user_id} />
                  </div>
                  <Badge variant={SUBSCRIPTION_STATUS_VARIANT[s.status]} className="shrink-0 text-[10px]">
                    {SUBSCRIPTION_STATUS_LABELS[s.status]}
                  </Badge>
                </div>
                <Select
                  value={s.plan_id}
                  onValueChange={(plan_id) => update.mutate({ id: s.id, plan_id })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <div><div className="text-[10px] opacity-70">Início</div>{formatDate(s.started_at, "dd/MM/yy")}</div>
                  <div><div className="text-[10px] opacity-70">Vence</div>{formatDate(s.current_period_end, "dd/MM/yy")}</div>
                  <div><div className="text-[10px] opacity-70">Trial</div>{formatDate(s.trial_ends_at, "dd/MM/yy")}</div>
                </div>
                {exempt && <Badge variant="secondary" className="text-[10px]">{exemptionLabel(s)}</Badge>}
                <div className="flex flex-wrap gap-1 pt-1 border-t">
                  {s.status !== "canceled" && !exempt && (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9"
                      onClick={() => update.mutate({ id: s.id, status: "canceled", canceled_at: new Date().toISOString() })}>
                      Cancelar
                    </Button>
                  )}
                  {s.status === "canceled" && (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9"
                      onClick={() => update.mutate({ id: s.id, status: "active", canceled_at: null })}>
                      Reativar
                    </Button>
                  )}
                  {s.status === "trialing" && (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9"
                      onClick={() => {
                        const cur = s.trial_ends_at ? new Date(s.trial_ends_at) : new Date();
                        cur.setDate(cur.getDate() + 7);
                        update.mutate({ id: s.id, trial_ends_at: cur.toISOString() });
                      }}>
                      +7d trial
                    </Button>
                  )}
                  {exempt ? (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9"
                      onClick={() => { if (confirm("Remover isenção?")) removeExemption.mutate(s.id); }}>
                      Remover isenção
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9"
                      onClick={() => setExemptTarget({ id: s.id, planId: s.plan_id })}>
                      Isentar
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ExemptSubscriptionDialog
        open={!!exemptTarget}
        onOpenChange={(o) => !o && setExemptTarget(null)}
        subscriptionId={exemptTarget?.id ?? null}
        defaultPlanId={exemptTarget?.planId ?? null}
      />
    </div>
  );
}
