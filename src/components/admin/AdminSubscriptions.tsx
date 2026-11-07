import { useState, useMemo } from "react";
import { RevokeExemptionDialog } from "@/components/admin/RevokeExemptionDialog";
import { CarenciaParametroCard } from "@/components/admin/CarenciaParametroCard";
import { TaxasCartaoParametroCard } from "@/components/admin/TaxasCartaoParametroCard";
import { NfseParametroCard } from "@/components/admin/NfseParametroCard";
import { ConciliacaoAsaasCard } from "@/components/admin/ConciliacaoAsaasCard";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const companyLabel = (s: any) => s.company?.trade_name || s.company?.name || "Sem empresa vinculada";
const activeAddons = (s: any) => (s.addons ?? []).filter((a: any) => a.status === "active").length;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Valor mensal cobrado: plano base + adicionais ativos que não são cortesia. */
const addonsCents = (s: any) =>
  (s.addons ?? [])
    .filter((a: any) => a.status === "active" && !a.is_exempt)
    .reduce((t: number, a: any) => t + Number(a.price_cents ?? 0) * Number(a.quantity ?? 1), 0);
const planCents = (s: any) => Number(s.plan?.price_cents ?? 0);
/** Valor proporcional de adicionais ainda não cobrado, que entra na próxima fatura. */
const prorataCents = (s: any) =>
  (s.addons ?? [])
    .filter((a: any) => a.status === "active" && !a.is_exempt && !a.prorata_billed_at)
    .reduce((t: number, a: any) => t + Number(a.prorata_cents ?? 0), 0);
const moduleLabel = (m?: string | null) => (m === "pessoas" ? "Pessoas 360°" : "Financeiro 360°");

const VIGENTES = ["trialing", "active", "grace", "past_due"];
const statusMatch = (filter: string, st: string) =>
  filter === "all" ? true : filter === "vigentes" ? VIGENTES.includes(st) : st === filter;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function AdminSubscriptions() {
  const [aba, setAba] = useState<"contratantes" | "sem_contratacao">("contratantes");
  const [showTest, setShowTest] = useState(false);
  const contratantesQ = useAdminSubscriptions("contratantes");
  const semQ = useAdminSubscriptions("sem_contratacao");
  const testeQ = useAdminSubscriptions("teste", showTest);
  const isLoading = aba === "contratantes" ? contratantesQ.isLoading || (showTest && testeQ.isLoading) : semQ.isLoading;
  const subs = useMemo(() => {
    if (aba === "sem_contratacao") {
      const extra = showTest ? (testeQ.data ?? []).filter((s: any) => !s.company_id) : [];
      return [...(semQ.data ?? []), ...extra];
    }
    const extra = showTest ? (testeQ.data ?? []).filter((s: any) => s.company_id) : [];
    return [...(contratantesQ.data ?? []), ...extra];
  }, [aba, showTest, contratantesQ.data, semQ.data, testeQ.data]);
  const { data: plans = [] } = usePlans();
  const { displayName } = useUserNames();

  const update = useUpdateSubscription();
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [graceId, setGraceId] = useState<string | null>(null);
  const podeCarencia = (s: any) => s.status === "active" && !s.is_exempt && !s.external_subscription_id;
  const [filter, setFilter] = useState<string>("vigentes");
  const [clientSortDir, setClientSortDir] = useState<"asc" | "desc" | null>(null);
  const [exemptTarget, setExemptTarget] = useState<{ id: string; planId: string } | null>(null);
  const [addonsTarget, setAddonsTarget] = useState<any>(null);
  const openAddons = (s: any) => setAddonsTarget({ id: s.id, module: s.module, planSlug: s.plan?.slug, companyName: companyLabel(s) });

  const filtered = useMemo(() => subs.filter((s: any) => statusMatch(filter, s.status)), [subs, filter]);

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
      <Tabs value={aba} onValueChange={(v) => setAba(v as any)}>
        <TabsList>
          <TabsTrigger value="contratantes">Contratantes</TabsTrigger>
          <TabsTrigger value="sem_contratacao">Cadastros sem contratação</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vigentes">Vigentes</SelectItem>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showTest} onCheckedChange={setShowTest} />
          Mostrar contas de teste
        </label>
        <p className="text-sm text-muted-foreground">
          {plural(filtered.length, aba === "contratantes" ? "assinatura" : "cadastro", aba === "contratantes" ? "assinaturas" : "cadastros")}
        </p>
      </div>

      {aba === "sem_contratacao" ? (
        <SemContratacaoLista itens={sortedFiltered} isLoading={isLoading} />
      ) : (<>
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
                    <TitularCell s={s} />
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
                        {prorataCents(s) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            + {brl(prorataCents(s))} proporcional na próxima fatura
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
                      {podeCarencia(s) && (
                        <Button size="sm" variant="ghost" onClick={() => setGraceId(s.id)}>
                          Iniciar carência
                        </Button>
                      )}
                      {exempt ? (
                        <Button size="sm" variant="ghost"
                          onClick={() => setRevokeId(s.id)}>
                          Revogar cortesia
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
                    <div className="text-xs text-muted-foreground"><TitularCell s={s} /></div>
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
                <p className="text-xs">
                  <span className="text-muted-foreground">Valor/mês: </span>
                  {exempt ? "Isento" : brl(planCents(s) + addonsCents(s))}
                  {!exempt && addonsCents(s) > 0 && (
                    <span className="text-muted-foreground"> ({brl(addonsCents(s))} em adicionais)</span>
                  )}
                </p>
                {!exempt && prorataCents(s) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    + {brl(prorataCents(s))} proporcional na próxima fatura
                  </p>
                )}
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
                  {podeCarencia(s) && (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9" onClick={() => setGraceId(s.id)}>
                      Iniciar carência
                    </Button>
                  )}
                  {exempt ? (
                    <Button size="sm" variant="outline" className="flex-1 min-h-9"
                      onClick={() => setRevokeId(s.id)}>
                      Revogar cortesia
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

      </>)}

      <CarenciaParametroCard />
      <TaxasCartaoParametroCard />
      <NfseParametroCard />
      <ConciliacaoAsaasCard />
      <RevokeExemptionDialog subscriptionId={revokeId} onOpenChange={(o) => !o && setRevokeId(null)} />
      <RevokeExemptionDialog mode="iniciar" subscriptionId={graceId} onOpenChange={(o) => !o && setGraceId(null)} />
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

function TitularCell({ s }: { s: any }) {
  const colab = Number(s.colaboradores_ativos ?? 0);
  const admins = Number(s.admins_equipe ?? 0);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <ClientCell userId={s.user_id} />
        {s.papel_usuario === "titular" && <Badge variant="outline" className="text-[10px]">Titular</Badge>}
        {s.is_test && <Badge variant="secondary" className="text-[10px]">Teste</Badge>}
      </div>
      <p className="text-[11px] text-muted-foreground font-normal">
        {plural(colab, "colaborador", "colaboradores")} · {plural(admins, "admin", "admins")}
      </p>
    </div>
  );
}

function VinculoBadge({ s }: { s: any }) {
  if (s.is_colaborador) return <Badge variant="secondary" className="text-[10px]">Colaborador</Badge>;
  if (s.is_equipe_admin) return <Badge variant="secondary" className="text-[10px]">Admin/Sócio</Badge>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

/** Somente leitura: cadastros que nunca contrataram não recebem ações de cobrança. */
function SemContratacaoLista({ itens, isLoading }: { itens: any[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (itens.length === 0) return <p className="text-center text-sm text-muted-foreground py-8">Nenhum cadastro</p>;
  return (
    <>
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vínculo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium"><ClientCell userId={s.user_id} /></TableCell>
                <TableCell className="text-sm">{s.email ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(s.cadastro_em ?? s.created_at, "dd/MM/yy")}</TableCell>
                <TableCell><Badge variant={SUBSCRIPTION_STATUS_VARIANT[s.status]}>{SUBSCRIPTION_STATUS_LABELS[s.status]}</Badge></TableCell>
                <TableCell><VinculoBadge s={s} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="md:hidden space-y-2">
        {itens.map((s) => (
          <div key={s.id} className="rounded-md border p-3 space-y-1 text-sm">
            <div className="flex items-start justify-between gap-2">
              <ClientCell userId={s.user_id} className="min-w-0" />
              <Badge variant={SUBSCRIPTION_STATUS_VARIANT[s.status]} className="shrink-0 text-[10px]">{SUBSCRIPTION_STATUS_LABELS[s.status]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{s.email ?? "—"}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Cadastro {formatDate(s.cadastro_em ?? s.created_at, "dd/MM/yy")}</span>
              <VinculoBadge s={s} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
