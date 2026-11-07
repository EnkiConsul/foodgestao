import React, { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ATALHOS, ATALHO_LABEL, PLANOS, PLANO_LABEL, PADRAO_CONTRATANTES, PADRAO_SEM, type ColunaOrdem,
  type FiltrosContratantes, type FiltrosSem, activeAddons, addonsCents, planCents, planoChave,
  contarAtivos, escrever, filtrarContratantes, filtrarSem, lerContratantes, lerSem, ordenar, resumo,
} from "@/lib/admin/assinaturasFiltros";
import { BarraFiltros, BuscaDebounce, Chips, Intervalo, SelectFiltro } from "./AssinaturasFiltros";
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
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Valor proporcional de adicionais ainda não cobrado, que entra na próxima fatura. */
const prorataCents = (s: any) =>
  (s.addons ?? [])
    .filter((a: any) => a.status === "active" && !a.is_exempt && !a.prorata_billed_at)
    .reduce((t: number, a: any) => t + Number(a.prorata_cents ?? 0), 0);
const moduleLabel = (m?: string | null) => (m === "pessoas" ? "Pessoas 360°" : "Financeiro 360°");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const CHAVES_C = { q: "q", status: "status", modulo: "modulo", plano: "plano", cobranca: "cobranca", forma: "forma", atalhos: "atalhos", ini_de: "ini_de", ini_ate: "ini_ate", venc_de: "venc_de", venc_ate: "venc_ate" };
const CHAVES_S = { sq: "q", sstatus: "status", vinculo: "vinculo", cad_de: "cad_de", cad_ate: "cad_ate" };
const COLUNAS: [ColunaOrdem, string][] = [["empresa", "Empresa"], ["titular", "Dono titular"], ["valor", "Valor/mês"], ["inicio", "Início"], ["vence", "Vence em"], ["trial", "Trial até"]];
const STATUS_KEYS = Object.keys(SUBSCRIPTION_STATUS_LABELS);

export function AdminSubscriptions() {
  const [params, setParams] = useSearchParams();
  const aba: "contratantes" | "sem_contratacao" = params.get("aba") === "sem" ? "sem_contratacao" : "contratantes";
  const setAba = (v: string) => {
    const p = new URLSearchParams();
    for (const [k, val] of params) if (!Object.values(CHAVES_C).includes(k) && !Object.values(CHAVES_S).includes(k) && k !== "aba") p.set(k, val);
    if (v === "sem_contratacao") p.set("aba", "sem");
    setParams(p, { replace: true });
    setSort({ col: null, dir: null });
  };
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
  const [sort, setSort] = useState<{ col: ColunaOrdem | null; dir: "asc" | "desc" | null }>({ col: null, dir: null });
  const [exemptTarget, setExemptTarget] = useState<{ id: string; planId: string } | null>(null);
  const [addonsTarget, setAddonsTarget] = useState<any>(null);
  const openAddons = (s: any) => setAddonsTarget({ id: s.id, module: s.module, planSlug: s.plan?.slug, companyName: companyLabel(s) });

  const fc = useMemo(() => lerContratantes(params, STATUS_KEYS), [params]);
  const fs = useMemo(() => lerSem(params, STATUS_KEYS), [params]);
  const setFc = (patch: Partial<FiltrosContratantes>) => {
    const next = { ...fc, ...patch };
    if (patch.modulo !== undefined && next.plano) {
      const ok = plans.some((p: any) => (!next.modulo || p.module === next.modulo) && planoChave({ plan: p }) === next.plano);
      if (!ok) next.plano = "";
    }
    setParams(escrever(params, next as any, PADRAO_CONTRATANTES as any, CHAVES_C), { replace: true });
  };
  const setFs = (patch: Partial<FiltrosSem>) =>
    setParams(escrever(params, { ...fs, ...patch } as any, PADRAO_SEM as any, CHAVES_S), { replace: true });
  const limpar = () => setParams(escrever(params, aba === "contratantes" ? (PADRAO_CONTRATANTES as any) : (PADRAO_SEM as any),
    aba === "contratantes" ? (PADRAO_CONTRATANTES as any) : (PADRAO_SEM as any), aba === "contratantes" ? CHAVES_C : CHAVES_S), { replace: true });
  const ativos = aba === "contratantes" ? contarAtivos(fc, PADRAO_CONTRATANTES) : contarAtivos(fs, PADRAO_SEM);

  const filtered = useMemo(
    () => (aba === "contratantes" ? filtrarContratantes(subs, fc, displayName) : filtrarSem(subs, fs, displayName)),
    [aba, subs, fc, fs, displayName],
  );
  const sortedFiltered = useMemo(() => ordenar(filtered, sort.col, sort.dir, displayName), [filtered, sort, displayName]);
  const indic = useMemo(() => resumo(filtered), [filtered]);

  const planLabel = (p: any) => (p.is_active ? p.name : `${p.name} (inativo)`);
  const planosDisponiveis = PLANOS.filter((k) => plans.some((p: any) => (!fc.modulo || p.module === fc.modulo) && planoChave({ plan: p }) === k));

  const toggleSort = (col: ColunaOrdem) =>
    setSort((prev) => (prev.col !== col ? { col, dir: "asc" } : prev.dir === "asc" ? { col, dir: "desc" } : { col: null, dir: null }));
  const SortHead = ({ col, children }: { col: ColunaOrdem; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(col)}
      aria-sort={sort.col === col ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sort.col === col && sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : sort.col === col && sort.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
      </span>
    </TableHead>
  );
  const statusOpts: [string, string][] = Object.entries(SUBSCRIPTION_STATUS_LABELS) as any;
  const vazio = ativos > 0 ? (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-muted-foreground">{aba === "contratantes" ? "Nenhuma assinatura com esses filtros" : "Nenhum cadastro com esses filtros"}</p>
      <Button size="sm" variant="outline" onClick={limpar}>Limpar filtros</Button>
    </div>
  ) : <p className="text-center text-sm text-muted-foreground py-8">{aba === "contratantes" ? "Nenhuma assinatura" : "Nenhum cadastro"}</p>;

  return (
    <div className="space-y-4">
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="contratantes">Contratantes</TabsTrigger>
          <TabsTrigger value="sem_contratacao">Cadastros sem contratação</TabsTrigger>
        </TabsList>
      </Tabs>

      {aba === "contratantes" ? (
        <BarraFiltros ativos={ativos} onLimpar={limpar}
          extra={<>
            <Chips opcoes={ATALHOS.map((a) => [a, ATALHO_LABEL[a]])} ativos={fc.atalhos}
              onToggle={(k) => setFc({ atalhos: fc.atalhos.includes(k) ? fc.atalhos.filter((x) => x !== k) : [...fc.atalhos, k] })} />
            <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:gap-4">
              <Intervalo label="Início" de={fc.ini_de} ate={fc.ini_ate} onChange={(ini_de, ini_ate) => setFc({ ini_de, ini_ate })} />
              <Intervalo label="Vence em" de={fc.venc_de} ate={fc.venc_ate} onChange={(venc_de, venc_ate) => setFc({ venc_de, venc_ate })} />
            </div>
          </>}>
          <BuscaDebounce value={fc.q} onChange={(q) => setFc({ q })} placeholder="Empresa, CNPJ, titular ou e-mail" />
          <SelectFiltro label="Status" value={fc.status} onChange={(status) => setFc({ status: status || "vigentes" })}
            options={[["vigentes", "Vigentes"], ["all", "Todos os status"], ...statusOpts]} />
          <SelectFiltro label="Módulo" value={fc.modulo} onChange={(modulo) => setFc({ modulo })}
            options={[["", "Todos os módulos"], ["financeiro", "Financeiro 360°"], ["pessoas", "Pessoas 360°"]]} />
          <SelectFiltro label="Plano" value={fc.plano} onChange={(plano) => setFc({ plano })}
            options={[["", "Todos os planos"], ...planosDisponiveis.map((k) => [k, PLANO_LABEL[k]] as [string, string])]} />
          <SelectFiltro label="Cobrança" value={fc.cobranca} onChange={(cobranca) => setFc({ cobranca })}
            options={[["", "Toda cobrança"], ["pagantes", "Pagando agora"], ["nao_cobrado", "Em carência ou trial"], ["isentos", "Isentos (cortesia)"]]} />
          <SelectFiltro label="Forma de cobrança" value={fc.forma} onChange={(forma) => setFc({ forma })}
            options={[["", "Toda forma"], ["automatica", "Automática"], ["manual", "Manual"]]} />
        </BarraFiltros>
      ) : (
        <BarraFiltros ativos={ativos} onLimpar={limpar}>
          <BuscaDebounce value={fs.sq} onChange={(sq) => setFs({ sq })} placeholder="Nome ou e-mail" />
          <SelectFiltro label="Status" value={fs.sstatus} onChange={(sstatus) => setFs({ sstatus: sstatus || "all" })}
            options={[["all", "Todos os status"], ...statusOpts]} />
          <SelectFiltro label="Vínculo" value={fs.vinculo} onChange={(vinculo) => setFs({ vinculo })}
            options={[["", "Todo vínculo"], ["colaborador", "Colaborador"], ["admin", "Admin/Sócio"], ["nenhum", "Sem vínculo"]]} />
          <Intervalo label="Cadastro em" de={fs.cad_de} ate={fs.cad_ate} onChange={(cad_de, cad_ate) => setFs({ cad_de, cad_ate })} />
        </BarraFiltros>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showTest} onCheckedChange={setShowTest} />
          Mostrar contas de teste
        </label>
        {aba === "contratantes" ? (
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-medium text-foreground">{indic.total} de {plural(subs.length, "assinatura", "assinaturas")}</span>
              <span>Receita mensal em vigor: <span className="font-semibold text-foreground">{brl(indic.receitaEmVigorCents)}</span></span>
              <span title="Valor de tabela de assinaturas que ainda não estão sendo cobradas" className="cursor-help underline decoration-dotted">
                A receber após carência/trial: {brl(indic.aReceberCents)}
              </span>
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>Pagando agora: {indic.pagando} ({brl(indic.pagandoCents)})</span>
              <span>Em carência: {indic.carencia} ({brl(indic.carenciaCents)})</span>
              <span>Em trial: {indic.trial} ({brl(indic.trialCents)})</span>
              <span>Isentos (cortesia): {indic.isentos}</span>
              {indic.outros > 0 && <span>Outros status: {indic.outros}</span>}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{filtered.length} de {plural(subs.length, "cadastro", "cadastros")}</p>
        )}
        {aba === "contratantes" && (
          <div className="md:hidden flex gap-2">
            <Select value={sort.col ?? "_"} onValueChange={(v) => setSort(v === "_" ? { col: null, dir: null } : { col: v as ColunaOrdem, dir: sort.dir ?? "asc" })}>
              <SelectTrigger className="flex-1" aria-label="Ordenar por"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Ordenar por: padrão</SelectItem>
                {COLUNAS.map(([k, v]) => <SelectItem key={k} value={k}>Ordenar por: {v}</SelectItem>)}
              </SelectContent>
            </Select>
            {sort.col && (
              <Button variant="outline" size="icon" aria-label="Inverter ordem"
                onClick={() => setSort({ col: sort.col, dir: sort.dir === "asc" ? "desc" : "asc" })}>
                {sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        )}
      </div>

      {aba === "sem_contratacao" ? (
        <SemContratacaoLista itens={sortedFiltered} isLoading={isLoading} vazio={vazio} />
      ) : (<>
      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead col="empresa">Empresa Contratante</SortHead>
              <SortHead col="titular">Dono Titular</SortHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Isenção</TableHead>
              <SortHead col="valor">Valor/mês</SortHead>
              <SortHead col="inicio">Início</SortHead>
              <SortHead col="vence">Vence em</SortHead>
              <SortHead col="trial">Trial até</SortHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10}>{vazio}</TableCell></TableRow>
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
          vazio
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
function SemContratacaoLista({ itens, isLoading, vazio }: { itens: any[]; isLoading: boolean; vazio: React.ReactNode }) {
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (itens.length === 0) return <>{vazio}</>;
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
