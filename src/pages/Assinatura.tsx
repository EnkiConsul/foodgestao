import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents, INVOICE_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@/lib/billing";
import { ROTULOS_RECURSO, type RecursoLimitado } from "@/lib/billing/limites";
import {
  useAdicionaisDisponiveis, useAdicionalDaMinhaAssinatura, useLimitesEmpresa,
  useMinhasAssinaturas, useMinhasFaturas, type MinhaAssinatura, type Modulo,
} from "@/hooks/useMinhaAssinatura";
import { Plus, Minus, ExternalLink, ShieldCheck, Sparkles, Receipt } from "lucide-react";

const MODULO_ROTULO: Record<Modulo, string> = {
  financeiro: "Financeiro 360°",
  pessoas: "Pessoas 360°",
};

const RECURSOS_POR_MODULO: Record<Modulo, RecursoLimitado[]> = {
  financeiro: ["empresas", "usuarios", "open_finance", "contadores"],
  pessoas: ["colaboradores", "unidades", "usuarios", "contadores"],
};

const dataBR = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SituacaoBadge({ a }: { a: MinhaAssinatura }) {
  if (a.is_exempt) return <Badge variant="secondary">Cortesia</Badge>;
  if (a.status === "trialing") {
    const dias = a.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(a.trial_ends_at).getTime() - Date.now()) / 86400000))
      : null;
    return <Badge>{dias !== null ? `Teste · ${dias} dia(s)` : "Período de teste"}</Badge>;
  }
  const variante = a.status === "active" ? "default" : a.status === "past_due" ? "destructive" : "secondary";
  return <Badge variant={variante}>{SUBSCRIPTION_STATUS_LABELS[a.status] ?? a.status}</Badge>;
}

/** Barra de consumo de um recurso do plano. */
function Consumo({ recurso, usado, limite }: { recurso: RecursoLimitado; usado: number; limite: number }) {
  const ilimitado = limite < 0;
  const pct = ilimitado ? 0 : Math.min(100, Math.round((usado / Math.max(1, limite)) * 100));
  const cor = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{maiuscula(ROTULOS_RECURSO[recurso])}</span>
        <span className="text-muted-foreground text-xs">
          {ilimitado ? `${usado} · sem limite` : `${usado} de ${limite}`}
        </span>
      </div>
      <Progress value={ilimitado ? 8 : pct} indicatorClassName={ilimitado ? "bg-muted-foreground/40" : cor} />
    </div>
  );
}

function PainelAssinatura({ assinatura }: { assinatura: MinhaAssinatura }) {
  const modulo = (assinatura.module ?? assinatura.plan?.module ?? "financeiro") as Modulo;
  const limites = useLimitesEmpresa(modulo);
  const catalogo = useAdicionaisDisponiveis(modulo, assinatura.plan?.slug ?? null);
  const acao = useAdicionalDaMinhaAssinatura();

  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [paraCancelar, setParaCancelar] = useState<any | null>(null);

  const contratados = useMemo(
    () => assinatura.addons.filter((a) => a.status === "active"),
    [assinatura.addons],
  );
  const contratadoPorAddon = useMemo(() => {
    const m = new Map<string, any>();
    contratados.forEach((a) => a.addon?.id && m.set(a.addon.id, a));
    return m;
  }, [contratados]);

  const lim = limites.data;
  const recursos = RECURSOS_POR_MODULO[modulo];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base md:text-lg">{assinatura.plan?.name ?? MODULO_ROTULO[modulo]}</CardTitle>
              <CardDescription>{assinatura.plan?.description ?? MODULO_ROTULO[modulo]}</CardDescription>
            </div>
            <SituacaoBadge a={assinatura} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Mensalidade</p>
              <p className="text-lg font-bold">
                {assinatura.is_exempt ? "Sem cobrança" : `${formatCents(assinatura.totalCents)}/mês`}
              </p>
              {!assinatura.is_exempt && assinatura.addonsCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  Plano {formatCents(assinatura.planCents)} + adicionais {formatCents(assinatura.addonsCents)}
                </p>
              )}
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Próxima renovação</p>
              <p className="text-lg font-bold">{dataBR(assinatura.current_period_end)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Ajuste proporcional</p>
              <p className="text-lg font-bold">
                {assinatura.prorataCents > 0 ? formatCents(assinatura.prorataCents) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {assinatura.prorataCents > 0
                  ? "Cobrado uma única vez na próxima fatura"
                  : "Nada proporcional pendente"}
              </p>
            </div>
          </div>

          {assinatura.is_exempt && (
            <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Sua conta está liberada como cortesia: não há cobrança e os recursos não têm limite.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O que você está usando</CardTitle>
          <CardDescription>Consumo atual da empresa selecionada, já somando os adicionais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {limites.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !lim ? (
            <p className="text-sm text-muted-foreground">Selecione uma empresa para ver o consumo.</p>
          ) : (
            recursos.map((r) => (
              <Consumo
                key={r}
                recurso={r}
                usado={Number(lim.used?.[r] ?? 0)}
                limite={Number(lim.limits?.[r] ?? -1)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Contratações adicionais
          </CardTitle>
          <CardDescription>
            Amplie seus limites quando precisar. O valor entra na mensalidade e a parte proporcional dos
            dias restantes é cobrada uma única vez na próxima fatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {catalogo.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (catalogo.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum adicional disponível para o seu plano.</p>
          ) : (
            (catalogo.data ?? []).map((a: any) => {
              const atual = contratadoPorAddon.get(a.id);
              const qtd = quantidades[a.id] ?? 1;
              return (
                <div key={a.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium">{a.name}</p>
                      {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                      <p className="text-xs text-muted-foreground">{formatCents(a.price_cents)}/mês por unidade</p>
                    </div>

                    {atual ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {atual.quantity} contratado(s)
                          {atual.is_exempt ? " · cortesia" : ` · ${formatCents(atual.price_cents * atual.quantity)}/mês`}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon" variant="outline" className="h-8 w-8"
                            disabled={acao.isPending || atual.quantity <= 1}
                            onClick={() => acao.mutate({
                              action: "quantidade", subscriptionId: assinatura.id,
                              itemId: atual.id, quantity: atual.quantity - 1,
                            })}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="outline" className="h-8 w-8"
                            disabled={acao.isPending || (a.max_quantity ? atual.quantity >= a.max_quantity : false)}
                            onClick={() => acao.mutate({
                              action: "quantidade", subscriptionId: assinatura.id,
                              itemId: atual.id, quantity: atual.quantity + 1,
                            })}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setParaCancelar(atual)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={1} max={a.max_quantity ?? undefined}
                          value={qtd} className="h-9 w-20"
                          onChange={(e) =>
                            setQuantidades((p) => ({ ...p, [a.id]: Math.max(1, Number(e.target.value) || 1) }))
                          }
                        />
                        <Button
                          size="sm" disabled={acao.isPending}
                          onClick={() => acao.mutate({
                            action: "contratar", subscriptionId: assinatura.id, addonId: a.id, quantity: qtd,
                          })}
                        >
                          Contratar
                        </Button>
                      </div>
                    )}
                  </div>
                  {atual && !atual.is_exempt && !atual.prorata_billed_at && Number(atual.prorata_cents ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatCents(atual.prorata_cents)} proporcional aos dias restantes, na próxima fatura.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!paraCancelar} onOpenChange={(o) => !o && setParaCancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este adicional?</AlertDialogTitle>
            <AlertDialogDescription>
              O limite volta ao que o seu plano inclui. Se você já estiver usando mais do que o plano permite,
              não será possível cadastrar novos registros até ajustar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (paraCancelar) {
                  acao.mutate({ action: "cancelar", subscriptionId: assinatura.id, itemId: paraCancelar.id });
                }
                setParaCancelar(null);
              }}
            >
              Cancelar adicional
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Faturas() {
  const { data, isLoading } = useMinhasFaturas();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma fatura emitida até agora.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {data.map((f: any) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
          <div className="min-w-[150px] flex-1">
            <p className="font-medium">{formatCents(f.amount_cents ?? f.amount ?? 0)}</p>
            <p className="text-xs text-muted-foreground">
              Vencimento {dataBR(f.due_date)}
              {f.paid_at ? ` · Paga em ${dataBR(f.paid_at)}` : ""}
            </p>
          </div>
          <Badge variant={f.status === "paid" ? "default" : f.status === "overdue" ? "destructive" : "secondary"}>
            {INVOICE_STATUS_LABELS[f.status] ?? f.status}
          </Badge>
          {f.status !== "paid" && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/checkout/pagamento/${f.id}`}>
                Pagar <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Assinatura() {
  const { data: assinaturas, isLoading } = useMinhasAssinaturas();
  const [aba, setAba] = useState<string>("");

  const lista = assinaturas ?? [];
  const abaAtiva = aba || lista[0]?.id || "";

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Plano e Assinatura</h1>
        <p className="text-xs text-muted-foreground md:text-sm">
          Acompanhe o seu plano, o consumo dos limites e contrate adicionais.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <p className="text-sm font-medium">Nenhuma assinatura no seu nome</p>
            <p className="text-sm text-muted-foreground">
              A cobrança fica no nome do dono da empresa. Se você trabalha em uma empresa de outra pessoa,
              a assinatura aparece na conta dele.
            </p>
          </CardContent>
        </Card>
      ) : lista.length === 1 ? (
        <PainelAssinatura assinatura={lista[0]} />
      ) : (
        <Tabs value={abaAtiva} onValueChange={setAba}>
          <TabsList>
            {lista.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {MODULO_ROTULO[(a.module ?? a.plan?.module ?? "financeiro") as Modulo]}
              </TabsTrigger>
            ))}
          </TabsList>
          {lista.map((a) => (
            <TabsContent key={a.id} value={a.id} className="mt-4">
              <PainelAssinatura assinatura={a} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" /> Minhas faturas
          </CardTitle>
          <CardDescription>Últimas cobranças emitidas para a sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Faturas />
        </CardContent>
      </Card>
    </div>
  );
}
