import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import {
  useContractOrdersModule,
  useExportOrders,
  useOrdersTrialSnapshot,
} from "@/hooks/useOrdersTrialSnapshot";
import { OrdersTrialBanner } from "@/components/orders/OrdersTrialBanner";
import {
  formatTrialDeadline,
  formatTrialTimeLeft,
  isConsultaMode,
  ordersTrialCountdown,
  retentionWindow,
  summarizeTrialUsage,
} from "@/lib/orders/trial";
import type { ModuleStatus } from "@/lib/modules";

const KEEP_LIST = [
  "Empresa e unidades",
  "Cardápios, produtos e complementos",
  "Clientes e endereços",
  "Pedidos e histórico completo",
  "Usuários, permissões e configurações",
];

export default function PedidosAssinatura() {
  const { entitlement, isLoading } = useOrdersEntitlement("orders.dashboard");
  const { data: snapshot, isLoading: loadingSnapshot } = useOrdersTrialSnapshot();
  const contract = useContractOrdersModule();
  const exportOrders = useExportOrders();
  const [reopenUnits, setReopenUnits] = useState(false);

  const status = (snapshot?.entitlement?.effective_status ??
    entitlement.effective_status) as ModuleStatus;
  const countdown = ordersTrialCountdown(snapshot?.trial_ends_at ?? entitlement.trial_ends_at);
  const consulta = isConsultaMode(status);
  const active = status === "active";
  const retention = retentionWindow(snapshot?.expired_at, snapshot?.retention_days);
  const canContract = entitlement.role === "owner" || entitlement.role === "admin";
  const usage = summarizeTrialUsage(snapshot?.usage);
  const inFlight = snapshot?.usage?.in_flight_orders ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Helmet>
        <title>Contratar Pedidos 360° — Assinatura do módulo</title>
        <meta
          name="description"
          content="Contrate o módulo Pedidos 360°: mantenha unidades, cardápios, pedidos e histórico após o teste gratuito de 7 dias."
        />
      </Helmet>

      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/pedidos">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao módulo Pedidos
        </Link>
      </Button>

      {!isLoading && <OrdersTrialBanner entitlement={entitlement} />}

      <h1 className="text-2xl font-bold md:text-3xl">Assinatura do Pedidos 360°</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {active
          ? "Módulo ativo. Nada expira e nenhuma operação fica bloqueada."
          : consulta
            ? "Modo consulta: os dados seguem disponíveis para leitura e exportação, mas novas operações estão bloqueadas."
            : "Contrate para continuar operando quando o teste gratuito terminar."}
      </p>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {active ? (
                <ShieldCheck className="h-4 w-4 text-primary" />
              ) : consulta ? (
                <Lock className="h-4 w-4 text-destructive" />
              ) : (
                <Clock className="h-4 w-4 text-primary" />
              )}
              Situação atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {loadingSnapshot ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={active ? "default" : consulta ? "destructive" : "secondary"}>
                    {active
                      ? "Ativo"
                      : consulta
                        ? "Modo consulta"
                        : status === "trial"
                          ? "Teste gratuito"
                          : "Não contratado"}
                  </Badge>
                </div>
                {status === "trial" && (
                  <p>
                    Restam <strong>{formatTrialTimeLeft(countdown)}</strong>. Encerramento exato em{" "}
                    <strong>{formatTrialDeadline(snapshot?.trial_ends_at) ?? "—"}</strong>.
                  </p>
                )}
                {consulta && (
                  <p>
                    Teste encerrado em{" "}
                    <strong>{formatTrialDeadline(snapshot?.expired_at) ?? "—"}</strong>. Unidades
                    abertas foram pausadas e os canais próprios de captação foram desativados.
                  </p>
                )}
                {retention && (
                  <p className="text-muted-foreground">
                    Retenção dos dados: até{" "}
                    {retention.until.toLocaleDateString("pt-BR")} ({retention.daysRemaining} dias
                    restantes), com consulta e exportação liberadas nesse período.
                  </p>
                )}
                {inFlight > 0 && (
                  <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      {inFlight} {inFlight === 1 ? "pedido em andamento" : "pedidos em andamento"}:
                      pedidos já aceitos continuam podendo ser preparados, entregues e concluídos.
                      Apenas a criação de novos pedidos é bloqueada.
                    </span>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">O que você já usou</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {usage.map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <div className="text-xl font-semibold">{item.value}</div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
            {(snapshot?.pending_setup?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">Pendências de configuração</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {snapshot!.pending_setup.map((p) => (
                    <li key={p.unit_id}>
                      Unidade {p.unit_code ?? p.unit_id.slice(0, 8)}: {p.missing.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> A contratação preserva tudo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1">
              {KEEP_LIST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {!active && (
              <>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0 pr-3">
                    <Label htmlFor="reopen" className="text-sm">
                      Reabrir unidades pausadas na contratação
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se desligado, as unidades voltam fechadas e você decide o momento de abrir.
                    </p>
                  </div>
                  <Switch id="reopen" checked={reopenUnits} onCheckedChange={setReopenUnits} />
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full" disabled={!canContract || contract.isPending}>
                      {contract.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Contratar módulo Pedidos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar contratação</AlertDialogTitle>
                      <AlertDialogDescription>
                        O módulo Pedidos será ativado imediatamente para esta empresa, com todos os
                        dados e configurações mantidos. A cobrança segue as condições do seu plano.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => contract.mutate({ reopenUnits })}>
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {!canContract && (
                  <p className="text-xs text-muted-foreground">
                    Apenas o proprietário ou administrador da empresa pode contratar o módulo.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Exportar seus pedidos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <p className="min-w-0 flex-1 text-muted-foreground">
              Baixe o histórico de pedidos em CSV. Disponível também em modo consulta.
            </p>
            <Button
              variant="outline"
              onClick={() => exportOrders.mutate(undefined)}
              disabled={exportOrders.isPending}
            >
              {exportOrders.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
