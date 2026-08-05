import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parsePriceToCents } from "@/lib/orders/catalog";
import { FULFILLMENT_LABELS } from "@/lib/orders/board";
import { orderTotalsCents } from "@/lib/orders/orders";
import type { FulfillmentMode } from "@/lib/orders/units";
import { useOrdersCategories, useOrdersMenus, useOrdersProducts } from "@/hooks/useOrdersCatalog";
import { useCreateManualOrder, useOrdersChannels, type ManualOrderItemInput } from "@/hooks/useOrdersBoard";
import type { OrdersUnit } from "@/hooks/useOrdersUnits";

interface Props {
  open: boolean;
  unit: OrdersUnit | null;
  onOpenChange: (open: boolean) => void;
}

interface DraftItem extends ManualOrderItemInput {
  name: string;
  unitPriceCents: number;
}

const STEPS = ["Tipo e cliente", "Itens", "Valores e revisão"] as const;

export function ManualOrderDialog({ open, unit, onOpenChange }: Props) {
  const [step, setStep] = useState(0);
  const [orderType, setOrderType] = useState<FulfillmentMode>("counter");
  const [channelId, setChannelId] = useState<string>("none");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [discount, setDiscount] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);

  const { data: channels } = useOrdersChannels();
  const { data: menus } = useOrdersMenus();
  const activeMenuId =
    menuId ?? menus?.find((m) => m.unit_id === unit?.id)?.id ?? menus?.[0]?.id ?? null;
  const { data: categories } = useOrdersCategories(activeMenuId);
  const { data: products } = useOrdersProducts(activeMenuId);
  const createOrder = useCreateManualOrder();

  const modes: FulfillmentMode[] =
    unit?.fulfillment_modes?.length ? unit.fulfillment_modes : ["counter", "pickup", "delivery", "table"];

  const totals = useMemo(
    () =>
      orderTotalsCents({
        items: items.map((i) => ({ unitPrice: i.unitPriceCents, quantity: i.quantity })),
        discount: parsePriceToCents(discount) ?? 0,
        deliveryFee: orderType === "delivery" ? (parsePriceToCents(deliveryFee) ?? 0) : 0,
        serviceFee: parsePriceToCents(serviceFee) ?? 0,
      }),
    [items, discount, deliveryFee, serviceFee, orderType],
  );

  const needsCustomer = orderType === "delivery";
  const canAdvance =
    step === 0
      ? !needsCustomer || (customerName.trim().length >= 2 && customerPhone.replace(/\D/g, "").length >= 8)
      : step === 1
        ? items.length > 0
        : true;

  function reset() {
    setStep(0);
    setItems([]);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setStreet("");
    setDistrict("");
    setCity("");
    setDiscount("");
    setDeliveryFee("");
    setServiceFee("");
    setChannelId("none");
  }

  function addProduct(id: string, name: string, price: number) {
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === id);
      if (found) {
        return prev.map((i) => (i.product_id === id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { product_id: id, quantity: 1, name, unitPriceCents: price }];
    });
  }

  function changeQty(id: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) => (i.product_id === id ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
    );
  }

  async function submit() {
    if (!unit) return;
    const result = await createOrder.mutateAsync({
      unitId: unit.id,
      orderType,
      channelId: channelId === "none" ? null : channelId,
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, notes: i.notes ?? null })),
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      discountCents: parsePriceToCents(discount) ?? 0,
      deliveryFeeCents: orderType === "delivery" ? (parsePriceToCents(deliveryFee) ?? 0) : 0,
      serviceFeeCents: parsePriceToCents(serviceFee) ?? 0,
      address:
        orderType === "delivery"
          ? { street: street.trim(), district: district.trim(), city: city.trim() }
          : null,
    });
    if (result?.success) {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" /> Novo pedido manual
          </DialogTitle>
          <DialogDescription>
            Etapa {step + 1} de {STEPS.length}: {STEPS[step]}. Os totais são calculados pelo servidor.
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-type">Tipo de atendimento</Label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as FulfillmentMode)}>
                  <SelectTrigger id="manual-type" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modes.map((m) => (
                      <SelectItem key={m} value={m}>
                        {FULFILLMENT_LABELS[m] ?? m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-channel">Canal de origem</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger id="manual-channel" className="min-h-11">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem canal (balcão)</SelectItem>
                    {(channels ?? [])
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-name">
                  Nome do cliente {needsCustomer && <span aria-hidden="true">*</span>}
                </Label>
                <Input
                  id="manual-name"
                  className="min-h-11"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required={needsCustomer}
                  aria-required={needsCustomer}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-phone">
                  Telefone {needsCustomer && <span aria-hidden="true">*</span>}
                </Label>
                <Input
                  id="manual-phone"
                  className="min-h-11"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required={needsCustomer}
                  aria-required={needsCustomer}
                />
              </div>
            </div>

            {orderType === "delivery" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="manual-street">Endereço</Label>
                  <Input id="manual-street" className="min-h-11" value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-district">Bairro</Label>
                  <Input id="manual-district" className="min-h-11" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-city">Cidade</Label>
                  <Input id="manual-city" className="min-h-11" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {(menus ?? []).length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="manual-menu">Cardápio</Label>
                <Select value={activeMenuId ?? ""} onValueChange={setMenuId}>
                  <SelectTrigger id="manual-menu" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(menus ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <ScrollArea className="h-64 rounded-md border p-2">
              {(categories ?? []).map((cat) => {
                const list = (products ?? []).filter(
                  (p) => p.category_id === cat.id && !p.archived_at && p.state !== "unavailable",
                );
                if (list.length === 0) return null;
                return (
                  <div key={cat.id} className="mb-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{cat.name}</p>
                    <ul className="space-y-1">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => addProduct(p.id, p.name, p.base_price_cents)}
                            className="flex min-h-11 w-full items-center justify-between rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="ml-2 shrink-0 text-muted-foreground">
                              {formatCents(p.base_price_cents)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {(products ?? []).length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  Nenhum produto disponível no cardápio desta unidade.
                </p>
              )}
            </ScrollArea>

            <div>
              <p className="mb-2 text-sm font-semibold">Itens do pedido</p>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((i) => (
                    <li key={i.product_id} className="flex items-center gap-2 text-sm">
                      <Button
                        variant="outline"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`Remover uma unidade de ${i.name}`}
                        onClick={() => changeQty(i.product_id, -1)}
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Badge variant="secondary">{i.quantity}</Badge>
                      <Button
                        variant="outline"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`Adicionar uma unidade de ${i.name}`}
                        onClick={() => changeQty(i.product_id, 1)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                      <span>{formatCents(i.unitPriceCents * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-notes">Observações</Label>
              <Textarea
                id="manual-notes"
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: sem cebola, entregar na portaria…"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="manual-discount">Desconto (R$)</Label>
                <Input id="manual-discount" className="min-h-11" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              {orderType === "delivery" && (
                <div className="space-y-2">
                  <Label htmlFor="manual-delivery-fee">Taxa de entrega (R$)</Label>
                  <Input id="manual-delivery-fee" className="min-h-11" inputMode="decimal" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="manual-service-fee">Taxa de serviço (R$)</Label>
                <Input id="manual-service-fee" className="min-h-11" inputMode="decimal" value={serviceFee} onChange={(e) => setServiceFee(e.target.value)} />
              </div>
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <p className="font-semibold">Revisão</p>
              <p className="text-muted-foreground">
                {FULFILLMENT_LABELS[orderType]} · {items.length} produto(s) ·{" "}
                {customerName.trim() || "cliente não identificado"}
              </p>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt>Subtotal estimado</dt>
                  <dd>{formatCents(totals.subtotal)}</dd>
                </div>
                <div className="flex justify-between font-semibold text-foreground">
                  <dt>Total estimado</dt>
                  <dd>{formatCents(totals.total)}</dd>
                </div>
              </dl>
              <p className="text-[11px] text-muted-foreground">
                Valor final é recalculado pelo servidor a partir do cardápio.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button className="min-h-11" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              Continuar
            </Button>
          ) : (
            <Button className="min-h-11" disabled={items.length === 0 || createOrder.isPending} onClick={submit}>
              {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Criar pedido
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
