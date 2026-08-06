import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  PlayCircle,
  Save,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrdersGuard } from "@/components/orders/OrdersGuard";
import { OrdersPageHeader } from "@/components/orders/OrdersPageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { StepErrors } from "@/components/orders/onboarding/StepErrors";
import { StepOperacao } from "@/components/orders/onboarding/StepOperacao";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import {
  useActivateOrdersUnit,
  useCreateTestOrder,
  useOrdersUnitChecklist,
  useOrdersUnitHours,
  useOrdersUnits,
  useSaveOrdersUnitReceiving,
  useSaveOrdersUnitService,
  type OrdersUnit,
} from "@/hooks/useOrdersUnits";
import {
  CHANNEL_LABELS,
  CHECKLIST_ITEMS,
  CHECKLIST_LABELS,
  FULFILLMENT_LABELS,
  FULFILLMENT_MODES,
  ORDER_CHANNELS,
  ONBOARDING_STEPS,
  PAYMENT_KINDS,
  PAYMENT_LABELS,
  UNIT_STATE_LABELS,
  WEEKDAYS,
  isValidMenuUrl,
  onboardingProgress,
  validateHourExceptions,
  validateHourPeriods,
  type ChecklistItem,
  type FulfillmentMode,
  type HourException,
  type HourPeriod,
  type OrderChannel,
  type PaymentKind,
} from "@/lib/orders/units";


const HELP = {
  pageTitle: "Ative sua primeira unidade em 4 etapas: operação, unidade, recebimento e abertura.",
  formasAtendimento: "Como os pedidos chegam ao cliente: retirada, entrega, no local etc.",
  canaisOrigem: "De onde o pedido é feito: app, WhatsApp, totem, etc. Diferente da forma de atendimento.",
  prep: "Tempo médio para preparar um pedido. Usado para estimar prazos ao cliente.",
  agendados: "Permite que o cliente marque um horário futuro para retirar ou receber o pedido.",
  horarios: "Dias e horários em que a unidade aceita pedidos. Sem período, o dia fica fechado.",
  feriados: "Datas específicas com horário diferente ou fechamento, além da regra semanal.",
  recebimento: "Formas de pagamento aceitas nos pedidos desta unidade.",
  aceite: "Define se cada pedido precisa ser confirmado manualmente ou entra já aceito.",
  linkCardapio: "Endereço onde o cliente acessa o cardápio, próprio ou de outra plataforma.",
  som: "Toca um alerta sonoro sempre que um novo pedido chegar.",
  notificacoes: "Envia avisos de novos pedidos e atualizações de status.",
  impressora: "Imprime automaticamente os pedidos aceitos na cozinha ou balcão.",
  checklist: "Itens que precisam estar prontos antes de abrir a unidade para pedidos reais.",
  pedidoTeste: "Cria um pedido fictício para validar o fluxo, sem afetar dados reais.",
  step1: "Dados de identificação da unidade: nome, código, contato e localização.",
  step2: "Como a unidade atende, quais canais usa e os horários de funcionamento.",
  step3: "Como os pedidos são recebidos: pagamentos, aceite e alertas.",
  step4: "Checklist final e abertura da unidade para começar a receber pedidos.",
} as const;

// ---------------- Etapa 2 ----------------
function StepUnidade({ unit, onSaved }: { unit: OrdersUnit; onSaved: () => void }) {
  const save = useSaveOrdersUnitService();
  const { data: config } = useOrdersUnitHours(unit.id);
  const [modes, setModes] = useState<FulfillmentMode[]>(unit.fulfillment_modes ?? []);
  const [channels, setChannels] = useState<OrderChannel[]>(unit.channels ?? []);
  const [prep, setPrep] = useState(unit.prep_time_minutes);
  const [scheduled, setScheduled] = useState(unit.scheduled_orders_enabled);
  const [hours, setHours] = useState<HourPeriod[]>([]);
  const [exceptions, setExceptions] = useState<HourException[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (config) {
      setHours(config.hours);
      setExceptions(config.exceptions);
    }
  }, [config]);

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const submit = () => {
    const found = [
      ...(modes.length === 0 ? ["Selecione ao menos uma forma de atendimento."] : []),
      ...(channels.length === 0 ? ["Selecione ao menos um canal de pedidos."] : []),
      ...(prep < 1 || prep > 480 ? ["Tempo de preparo deve estar entre 1 e 480 minutos."] : []),
      ...validateHourPeriods(hours),
      ...validateHourExceptions(exceptions),
    ];
    setErrors(found);
    if (found.length > 0) return;
    save.mutate(
      {
        unitId: unit.id,
        fulfillment_modes: modes,
        channels,
        prep_time_minutes: prep,
        scheduled_orders_enabled: scheduled,
        hours,
        exceptions,
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          Formas de atendimento <span className="text-destructive">*</span>
          <HelpHint text={HELP.formasAtendimento} />
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {FULFILLMENT_MODES.map((m) => (
            <label key={m} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
              <Checkbox checked={modes.includes(m)} onCheckedChange={() => toggle(modes, m, setModes)} />
              {FULFILLMENT_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          Canais de origem do pedido <span className="text-destructive">*</span>
          <HelpHint text={HELP.canaisOrigem} />
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {ORDER_CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
              <Checkbox checked={channels.includes(c)} onCheckedChange={() => toggle(channels, c, setChannels)} />
              {CHANNEL_LABELS[c]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Canal é a origem do pedido; a forma de atendimento define como o pedido é entregue.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prep" className="flex items-center gap-1.5">
            Tempo padrão de preparo (min) <span className="text-destructive">*</span>
            <HelpHint text={HELP.prep} />
          </Label>
          <Input id="prep" type="number" min={1} max={480} value={prep} onChange={(e) => setPrep(Number(e.target.value))} />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Pedidos agendados <HelpHint text={HELP.agendados} />
            </p>
            <p className="text-xs text-muted-foreground">Opcional</p>
          </div>
          <Switch checked={scheduled} onCheckedChange={setScheduled} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            Horários de funcionamento <span className="text-destructive">*</span>
            <HelpHint text={HELP.horarios} />
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setHours([...hours, { weekday: 1, opens_at: "11:00", closes_at: "15:00" }])}
          >
            Adicionar período
          </Button>
        </div>
        {hours.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum período. Dias sem período ficam fechados para pedidos.
          </p>
        )}
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={`${i}-${h.weekday}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Select
                value={String(h.weekday)}
                onValueChange={(v) =>
                  setHours(hours.map((x, idx) => (idx === i ? { ...x, weekday: Number(v) } : x)))
                }
              >
                <SelectTrigger className="min-h-11 w-full sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                className="min-h-11 w-[46%] sm:w-[110px]"
                value={h.opens_at}
                onChange={(e) => setHours(hours.map((x, idx) => (idx === i ? { ...x, opens_at: e.target.value } : x)))}
              />
              <span className="text-xs text-muted-foreground">às</span>
              <Input
                type="time"
                className="min-h-11 w-[46%] sm:w-[110px]"
                value={h.closes_at}
                onChange={(e) => setHours(hours.map((x, idx) => (idx === i ? { ...x, closes_at: e.target.value } : x)))}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => setHours(hours.filter((_, idx) => idx !== i))}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            Feriados e datas especiais (opcional) <HelpHint text={HELP.feriados} />
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setExceptions([
                ...exceptions,
                { exception_date: new Date().toISOString().slice(0, 10), is_closed: true, note: "" },
              ])
            }
          >
            Adicionar data
          </Button>
        </div>
        {exceptions.map((e, i) => (
          <div key={`${i}-${e.exception_date}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <Input
              type="date"
              className="min-h-11 w-full sm:w-[150px]"
              value={e.exception_date}
              onChange={(ev) =>
                setExceptions(exceptions.map((x, idx) => (idx === i ? { ...x, exception_date: ev.target.value } : x)))
              }
            />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={e.is_closed}
                onCheckedChange={(v) =>
                  setExceptions(
                    exceptions.map((x, idx) =>
                      idx === i ? { ...x, is_closed: Boolean(v), opens_at: null, closes_at: null } : x,
                    ),
                  )
                }
              />
              Fechada
            </label>
            {!e.is_closed && (
              <>
                <Input
                  type="time"
                  className="w-[110px]"
                  value={e.opens_at ?? ""}
                  onChange={(ev) =>
                    setExceptions(exceptions.map((x, idx) => (idx === i ? { ...x, opens_at: ev.target.value } : x)))
                  }
                />
                <Input
                  type="time"
                  className="w-[110px]"
                  value={e.closes_at ?? ""}
                  onChange={(ev) =>
                    setExceptions(exceptions.map((x, idx) => (idx === i ? { ...x, closes_at: ev.target.value } : x)))
                  }
                />
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={() => setExceptions(exceptions.filter((_, idx) => idx !== i))}
            >
              Remover
            </Button>
          </div>
        ))}
      </div>

      <StepErrors errors={errors} />
      <Button onClick={submit} disabled={save.isPending} className="w-full sm:w-auto">
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar e continuar
      </Button>
    </div>
  );
}

// ---------------- Etapa 3 ----------------
function StepRecebimento({ unit, onSaved }: { unit: OrdersUnit; onSaved: () => void }) {
  const save = useSaveOrdersUnitReceiving();
  const { data: config } = useOrdersUnitHours(unit.id);
  const [kinds, setKinds] = useState<PaymentKind[]>([]);
  const [acceptMode, setAcceptMode] = useState(unit.accept_mode);
  const [sound, setSound] = useState(unit.sound_enabled);
  const [notif, setNotif] = useState(unit.notifications_enabled);
  const [printer, setPrinter] = useState(unit.printer_enabled);
  const [menu, setMenu] = useState(unit.external_menu_url ?? "");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (config) setKinds(config.paymentKinds);
  }, [config]);

  const submit = () => {
    const found = [
      ...(kinds.length === 0 ? ["Selecione ao menos uma forma de recebimento."] : []),
      ...(menu.trim() && !isValidMenuUrl(menu) ? ["Informe um link de cardápio válido (http/https)."] : []),
    ];
    setErrors(found);
    if (found.length > 0) return;
    save.mutate(
      {
        unitId: unit.id,
        payment_kinds: kinds,
        accept_mode: acceptMode,
        sound_enabled: sound,
        notifications_enabled: notif,
        printer_enabled: printer,
        external_menu_url: menu.trim() || null,
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          Formas de recebimento <span className="text-destructive">*</span>
          <HelpHint text={HELP.recebimento} />
        </Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {PAYMENT_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
              <Checkbox
                checked={kinds.includes(k)}
                onCheckedChange={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
              />
              {PAYMENT_LABELS[k]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Independente do módulo Financeiro — nada aqui exige contas ou categorias.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          Aceite dos pedidos <span className="text-destructive">*</span>
          <HelpHint text={HELP.aceite} />
        </Label>
        <Select value={acceptMode} onValueChange={(v) => setAcceptMode(v as "manual" | "automatic")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual (a equipe confirma cada pedido)</SelectItem>
            <SelectItem value="automatic">Automático (pedido entra já aceito)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="menu" className="flex items-center gap-1.5">
          Link do cardápio (próprio ou externo) <span className="text-destructive">*</span>
          <HelpHint text={HELP.linkCardapio} />
        </Label>
        <Input id="menu" value={menu} onChange={(e) => setMenu(e.target.value)} placeholder="https://..." />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Som de novo pedido", value: sound, set: setSound, opt: false, help: HELP.som },
          { label: "Notificações", value: notif, set: setNotif, opt: false, help: HELP.notificacoes },
          { label: "Impressora", value: printer, set: setPrinter, opt: true, help: HELP.impressora },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {item.label} <HelpHint text={item.help} />
              </p>
              <p className="text-xs text-muted-foreground">{item.opt ? "Opcional" : "Recomendado"}</p>
            </div>
            <Switch checked={item.value} onCheckedChange={item.set} />
          </div>
        ))}
      </div>

      <StepErrors errors={errors} />
      <Button onClick={submit} disabled={save.isPending} className="w-full sm:w-auto">
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar e continuar
      </Button>
    </div>
  );
}

// ---------------- Etapa 4 ----------------
function StepAbertura({ unit }: { unit: OrdersUnit }) {
  const { data: checklist, isLoading, refetch } = useOrdersUnitChecklist(unit.id);
  const testOrder = useCreateTestOrder();
  const activate = useActivateOrdersUnit();

  const items = checklist?.items ?? ({} as Record<ChecklistItem, boolean>);
  const ready = Boolean(checklist?.ready);
  const isOpen = unit.operational_state === "open";

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          Checklist obrigatório <HelpHint text={HELP.checklist} />
        </p>
        <div className="rounded-md border divide-y">
          {CHECKLIST_ITEMS.map((key) => {
            const ok = items[key] === true;
            return (
              <div key={key} className="flex items-center gap-2 px-3 py-2 text-sm">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={ok ? "" : "text-muted-foreground"}>{CHECKLIST_LABELS[key]}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Opcionais: impressora, equipe adicional, entrega própria, mesas e integrações externas.
        </p>
      </div>

      <div className="rounded-md border p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          Pedido de teste <HelpHint text={HELP.pedidoTeste} />
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Simulação isolada: não altera estoque, não gera cobrança, relatórios, lançamentos financeiros
          ou mensagens ao cliente.
        </p>
        <Button
          variant="outline"
          disabled={testOrder.isPending}
          onClick={() => testOrder.mutate(unit.id, { onSuccess: () => refetch() })}
        >
          {testOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          {unit.test_order_completed_at ? "Refazer pedido de teste" : "Fazer pedido de teste"}
        </Button>
      </div>

      {isOpen ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Aguardando novos pedidos
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unidade aberta desde {unit.activated_at ? new Date(unit.activated_at).toLocaleString("pt-BR") : "agora"}.
          </p>
        </div>
      ) : (
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={isLoading || !ready || activate.isPending}
          onClick={() => activate.mutate(unit.id, { onSuccess: () => refetch() })}
        >
          {activate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
          Abrir unidade para pedidos
        </Button>
      )}
      {!ready && !isLoading && !isOpen && (
        <p className="text-xs text-muted-foreground">
          Conclua todos os itens obrigatórios para liberar a abertura. A validação final é feita no
          servidor.
        </p>
      )}
    </div>
  );
}

// ---------------- Página ----------------
function OnboardingContent() {
  useOrdersEntitlement("orders.settings");
  const { data: units, isLoading } = useOrdersUnits();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const unit = useMemo(
    () => units?.find((u) => u.id === unitId) ?? units?.[0] ?? null,
    [units, unitId],
  );

  useEffect(() => {
    if (unit) {
      setUnitId(unit.id);
      setStep((prev) => Math.max(prev, Math.min(unit.onboarding_step, 4)));
    }
  }, [unit?.id, unit?.onboarding_step, unit]);

  const activated = Boolean(unit?.activated_at);
  const progress = onboardingProgress(unit?.onboarding_step ?? 1, activated);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <Helmet>
        <title>Ativar unidade — Pedidos 360°</title>
        <meta
          name="description"
          content="Onboarding do módulo Pedidos 360°: cadastre a operação, configure a unidade, prepare o recebimento e abra para pedidos."
        />
      </Helmet>

      <OrdersPageHeader
        backTo="/pedidos"
        backLabel="Voltar ao módulo Pedidos"
        title="Ativar sua primeira unidade"
        icon={<Store className="h-6 w-6 text-primary" aria-hidden="true" />}
        subtitle={
          <span className="inline-flex items-center gap-1">
            Cada etapa é gravada separadamente — salve e continue depois.
            <HelpHint text={HELP.pageTitle} />
          </span>
        }
        actions={
          unit ? (
            <Badge variant={activated ? "default" : "secondary"} className="shrink-0">
              {UNIT_STATE_LABELS[unit.operational_state]}
            </Badge>
          ) : undefined
        }
      >
        <div>
          <Progress value={progress} className="h-2" />
          <p className="mt-1 text-xs text-muted-foreground">{progress}% concluído</p>
        </div>
      </OrdersPageHeader>

      {units && units.length > 1 && (
        <div className="mb-4">
          <Label className="text-xs">Unidade</Label>
          <Select value={unit?.id ?? ""} onValueChange={setUnitId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-3">
        {ONBOARDING_STEPS.map((s) => {
          const active = step === s.step;
          const done = (unit?.onboarding_step ?? 1) > s.step || (activated && s.step === 4);
          const locked = !unit && s.step > 1;
          return (
            <Card key={s.step} className={active ? "border-primary/40" : undefined}>
              <CardContent className="p-4">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  disabled={locked}
                  onClick={() => !locked && setStep(s.step)}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : s.step}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {s.title}
                      <HelpHint
                        text={
                          s.step === 1
                            ? HELP.step1
                            : s.step === 2
                              ? HELP.step2
                              : s.step === 3
                                ? HELP.step3
                                : HELP.step4
                        }
                      />
                    </span>
                    <span className="block text-xs text-muted-foreground">{s.desc}</span>
                  </span>
                </button>
                {active && (
                  <div className="mt-4 border-t pt-4">
                    {s.step === 1 && (
                      <StepOperacao
                        unit={unit}
                        onSaved={(id) => {
                          setUnitId(id);
                          setStep(2);
                        }}
                      />
                    )}
                    {s.step === 2 && unit && <StepUnidade unit={unit} onSaved={() => setStep(3)} />}
                    {s.step === 3 && unit && <StepRecebimento unit={unit} onSaved={() => setStep(4)} />}
                    {s.step === 4 && unit && <StepAbertura unit={unit} />}
                    {s.step > 1 && !unit && (
                      <p className="text-sm text-muted-foreground">
                        Cadastre a operação na etapa 1 para continuar.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function PedidosOnboarding() {
  return (
    <OrdersGuard operation="orders.settings">
      <OnboardingContent />
    </OrdersGuard>
  );
}
