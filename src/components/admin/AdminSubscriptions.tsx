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
import { SubscriptionAddonsDialog } from "./SubscriptionAddonsDialog";

const companyLabel = (s: any) => s.company?.trade_name || s.company?.name || "Sem empresa vinculada";
const activeAddons = (s: any) => (s.addons ?? []).filter((a: any) => a.status === "active").length;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Valor mensal cobrado: plano base + adicionais ativos que não são cortesia. */
const addonsCents = (s: any) =>
  (s.addons ?? [])
    .filter((a: any) => a.status === "active" && !a.is_exempt)
    .reduce((t: number, a: any) => t + Number(a.price_cents ?? 0) * Number(a.quantity ?? 1), 0);
const planCents = (s: any) => Number(s.plan?.price_cents ?? 0);
const moduleLabel = (m?: string | null) => (m === "pessoas" ? "Pessoas 360°" : "Financeiro 360°");
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

/** Test/seed accounts and collaborator portal logins pollute the list. */
const SEED_ID_PREFIXES = ["11111111-", "22222222-", "33333333-", "44444444-", "55555555-"];
function isNoiseAccount(userId?: string | null, name?: string | null) {
  if (!userId) return false;
  if (SEED_ID_PREFIXES.some((p) => userId.startsWith(p))) return true;
  const n = (name ?? "").toLowerCase();
  if (!n) return false;
  return (
    // qualquer domínio interno do portal do colaborador, independente da marca
    /@portal\.[a-z0-9.-]+\.local$/.test(n) ||
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
  const [addonsTarget, setAddonsTarget] = useState<any>(null);
  const openAddons = (s: any) => setAddonsTarget({ id: s.id, module: s.module, planSlug: s.plan?.slug, companyName: companyLabel(s) });

  const byStatus = filter === "all" ? subs : subs.filter((s: any) => s.status === filter);
  const noiseCount = useMemo(
    () => byStatus.filter((s: any) => isNoiseAccount(s.user_id, realName(s.user_id))).length,
    [byStatus, realName]
  );
  const filtered = useMemo(
    () => (hideTest ? byStatus.filter((s: any) => !isNoiseAccount(s.user_id, realName(s.user_id))) : byStatus),
    [byStatus, hideTest, realName]
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
              <TableHead>Empresa Contratante</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={toggleClientSort}>
                <span className="inline-flex items-center gap-1">
                  Dono Titular
                  {clientSortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : clientSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                </span>
              </TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Isenção</TableHead>
              <TableHead>Valor/mês</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Vence em</TableHead>
              <TableHead>Trial até</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhuma assinatura</TableCell></TableRow>
            ) : (
              sortedFiltered.map((s: any) => {
                const exempt = isExempt(s);
                return (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="font-medium">{companyLabel(s)}</p>
                    <p className="text-xs text-muted-foreground">{s.company?.cnpj || moduleLabel(s.module)}</p>
                  </TableCell>
                  <TableCell className="font-medium">
                    <ClientCell userId={s.user_id} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={s.plan_id}
                      onValueChange={(plan_id) => update.mutate({ id: s.id, plan_id })}
                    >
                      <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {plans.filter((p: any) => p.module === (s.module ?? "financeiro")).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{planLabel(p)}</SelectItem>
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
                  <TableCell className="whitespace-nowrap">
                    {exempt ? (
                      <span className="text-xs text-muted-foreground">Isento</span>
                    ) : (
                      <>
                        <p className="font-medium">{brl(planCents(s) + addonsCents(s))}</p>
                        {addonsCents(s) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {brl(planCents(s))} + {brl(addonsCents(s))} adicionais
                          </p>
                        )}
                      </>
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
                      <Button size="sm" variant="ghost" onClick={() => openAddons(s)}>
                        Adicionais{activeAddons(s) ? ` (${activeAddons(s)})` : ""}
                      </Button>
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
                  <div className="min-w-0 text-sm">
                    <p className="font-medium truncate">{companyLabel(s)}</p>
                    <div className="text-xs text-muted-foreground truncate"><ClientCell userId={s.user_id} /></div>
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
                    {plans.filter((p: any) => p.module === (s.module ?? "financeiro")).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{planLabel(p)}</SelectItem>
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
                  <Button size="sm" variant="outline" className="flex-1 min-h-9" onClick={() => openAddons(s)}>
                    Adicionais{activeAddons(s) ? ` (${activeAddons(s)})` : ""}
                  </Button>
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
      <SubscriptionAddonsDialog
        open={!!addonsTarget}
        onOpenChange={(o) => !o && setAddonsTarget(null)}
        subscription={addonsTarget}
      />
    </div>
  );
}
