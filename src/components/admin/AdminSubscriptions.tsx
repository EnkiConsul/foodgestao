import { useState } from "react";
import { useAdminSubscriptions, useUpdateSubscription } from "@/hooks/useBilling";
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
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANT } from "@/lib/billing";

export function AdminSubscriptions() {
  const { data: subs = [], isLoading } = useAdminSubscriptions();
  const { data: plans = [] } = usePlans();
  const update = useUpdateSubscription();
  const [filter, setFilter] = useState<string>("all");

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
              <TableHead>Usuário</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Vence em</TableHead>
              <TableHead>Trial até</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma assinatura</TableCell></TableRow>
            ) : (
              filtered.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.user_id.slice(0, 8)}…</TableCell>
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
                    <div className="flex gap-1">
                      {s.status !== "canceled" && (
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
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
