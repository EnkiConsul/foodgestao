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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

export function AdminSubscriptions() {
  const { data: subs = [], isLoading } = useAdminSubscriptions();
  const { data: plans = [] } = usePlans();
  
  const update = useUpdateSubscription();
  const removeExemption = useRemoveExemption();
  const [filter, setFilter] = useState<string>("all");
  const [exemptTarget, setExemptTarget] = useState<{ id: string; planId: string } | null>(null);

  const filtered = filter === "all" ? subs : subs.filter((s: any) => s.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} assinaturas</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
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
              filtered.map((s: any) => {
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
                    {format(new Date(s.started_at), "dd/MM/yy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.current_period_end ? format(new Date(s.current_period_end), "dd/MM/yy", { locale: ptBR }) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.trial_ends_at ? format(new Date(s.trial_ends_at), "dd/MM/yy", { locale: ptBR }) : "—"}
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

      <ExemptSubscriptionDialog
        open={!!exemptTarget}
        onOpenChange={(o) => !o && setExemptTarget(null)}
        subscriptionId={exemptTarget?.id ?? null}
        defaultPlanId={exemptTarget?.planId ?? null}
      />
    </div>
  );
}
