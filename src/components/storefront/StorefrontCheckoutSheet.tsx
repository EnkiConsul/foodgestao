import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlacePublicOrder, type PlacedOrder } from "@/hooks/usePublicStorefront";
import {
  ORDER_TYPE_LABELS,
  cartItemTotal,
  cartToWhatsappText,
  computeCartTotals,
  formatCents,
  validateCart,
  whatsappLink,
  type CartItem,
  type PublicStorefront,
} from "@/lib/orders/storefront";

interface Props {
  data: PublicStorefront;
  items: CartItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onPlaced: (order: PlacedOrder, phone: string) => void;
}

export default function StorefrontCheckoutSheet({
  data,
  items,
  open,
  onOpenChange,
  onChangeQuantity,
  onRemove,
  onPlaced,
}: Props) {
  const place = usePlacePublicOrder();
  const modes = data.unit.fulfillment_modes.length > 0 ? data.unit.fulfillment_modes : ["counter"];

  const [orderType, setOrderType] = useState(modes[0]);
  const [zoneId, setZoneId] = useState<string | null>(data.zones[0]?.id ?? null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [reference, setReference] = useState("");
  const [paymentOptionId, setPaymentOptionId] = useState<string | null>(data.payment_options[0]?.id ?? null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const isDelivery = orderType === "delivery";
  const zone = useMemo(() => data.zones.find((z) => z.id === zoneId) ?? null, [data.zones, zoneId]);
  const totals = computeCartTotals(items, {
    zone,
    serviceFeePercent: data.unit.service_fee_percent,
    isDelivery,
  });

  const submit = () => {
    const found = validateCart({
      items,
      orderType,
      minOrderAmount: data.unit.min_order_amount,
      zone,
      customerName: name,
      customerPhone: phone,
      street,
      number,
      paymentOptionId,
      requirePayment: data.payment_options.length > 0,
    });
    setErrors(found);
    if (found.length > 0) return;

    place.mutate(
      {
        slug: data.store.slug,
        items,
        orderType,
        customerName: name,
        customerPhone: phone,
        notes,
        zoneId: isDelivery ? zoneId : null,
        address: isDelivery
          ? { street, number, complement, district, reference }
          : null,
        paymentOptionId,
      },
      {
        onSuccess: (order) => {
          setPlaced(order);
          onPlaced(order, phone);
        },
        onError: (e: Error) => {
          setErrors([e.message]);
          toast.error(e.message);
        },
      },
    );
  };

  // O Sheet é renderizado num portal fora da página da loja: reaplica o tema aqui.
  const theme = themeStyle(data.store.theme, data.store.primary_color);
  const surface = {
    ...theme,
    background: "var(--sf-surface)",
    color: "var(--sf-text)",
    fontFamily: "var(--sf-font-body)",
  };
  const border = { borderColor: "var(--sf-border)" };
  const fieldStyle = { background: "var(--sf-bg)", borderColor: "var(--sf-border)", color: "var(--sf-text)" };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[94vh] overflow-y-auto rounded-t-2xl border-0 p-0" style={surface}>
        {placed ? (
          <div className="space-y-4 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--sf-primary)" }} />
            <div>
              <p className="text-lg font-semibold">Pedido enviado!</p>
              <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
                Seu número é <strong>#{placed.display_number}</strong>. Acompanhe o preparo pela página da loja.
              </p>
            </div>
            <div className="rounded-lg border p-3 text-left text-sm" style={border}>
              <Row label="Subtotal" value={formatCents(placed.subtotal)} />
              {placed.delivery_fee > 0 && <Row label="Entrega" value={formatCents(placed.delivery_fee)} />}
              {placed.service_fee > 0 && <Row label="Taxa de serviço" value={formatCents(placed.service_fee)} />}
              <Row label="Total" value={formatCents(placed.total_amount)} strong />
            </div>
            <Button
              className="h-11 w-full border-0"
              style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
              onClick={() => {
                setPlaced(null);
                onOpenChange(false);
              }}
            >
              Voltar ao cardápio
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-5 p-4 pb-28">
              <SheetHeader className="text-left">
                <SheetTitle style={{ color: "var(--sf-text)" }}>Seu pedido</SheetTitle>
              </SheetHeader>

              {/* Itens */}
              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
                    Seu carrinho está vazio.
                  </p>
                )}
                {items.map((item) => (
                  <div key={item.key} className="rounded-lg border p-3" style={border}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.product_name}
                          {item.variant_name ? ` · ${item.variant_name}` : ""}
                        </p>
                        {item.options.length > 0 && (
                          <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                            {item.options.map((o) => o.name).join(", ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs italic" style={{ color: "var(--sf-muted)" }}>
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold">{formatCents(cartItemTotal(item))}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full border px-2 py-1" style={border}>
                        <button
                          type="button"
                          aria-label="Diminuir"
                          className="p-0.5"
                          onClick={() => onChangeQuantity(item.key, item.quantity - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-5 text-center text-sm">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Aumentar"
                          className="p-0.5"
                          onClick={() => onChangeQuantity(item.key, item.quantity + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 text-xs text-destructive"
                        onClick={() => onRemove(item.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Forma de atendimento */}
              <div className="space-y-2">
                <Label>Como você quer receber?</Label>
                <div className="flex flex-wrap gap-2">
                  {modes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setOrderType(m)}
                      className="rounded-full border px-3 py-1.5 text-sm"
                      style={
                        orderType === m
                          ? { background: "var(--sf-primary)", color: "var(--sf-on-primary)", borderColor: "var(--sf-primary)" }
                          : border
                      }
                    >
                      {ORDER_TYPE_LABELS[m] ?? m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dados do cliente */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sf-name">Seu nome</Label>
                  <Input id="sf-name" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sf-phone">WhatsApp com DDD</Label>
                  <Input
                    id="sf-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="(62) 99999-9999"
                    style={fieldStyle}
                  />
                </div>
              </div>

              {isDelivery && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Região de entrega</Label>
                    <div className="space-y-2">
                      {data.zones.length === 0 && (
                        <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
                          Nenhuma região cadastrada. Escolha outra forma de atendimento.
                        </p>
                      )}
                      {data.zones.map((z) => (
                        <label
                          key={z.id}
                          className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                          style={border}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="sf-zone"
                              checked={zoneId === z.id}
                              onChange={() => setZoneId(z.id)}
                              className="h-4 w-4 accent-[var(--sf-primary)]"
                            />
                            <span>
                              {z.name}
                              {z.eta_minutes ? (
                                <span className="block text-xs" style={{ color: "var(--sf-muted)" }}>
                                  aprox. {z.eta_minutes} min
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span style={{ color: "var(--sf-muted)" }}>{formatCents(z.fee_amount)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="sf-street">Rua</Label>
                      <Input id="sf-street" value={street} onChange={(e) => setStreet(e.target.value)} style={fieldStyle} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sf-number">Número</Label>
                      <Input id="sf-number" value={number} onChange={(e) => setNumber(e.target.value)} style={fieldStyle} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sf-complement">Complemento</Label>
                      <Input
                        id="sf-complement"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        style={fieldStyle}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sf-district">Bairro</Label>
                      <Input id="sf-district" value={district} onChange={(e) => setDistrict(e.target.value)} style={fieldStyle} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sf-reference">Referência</Label>
                      <Input
                        id="sf-reference"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        style={fieldStyle}
                      />
                    </div>
                  </div>
                </div>
              )}

              {data.payment_options.length > 0 && (
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <div className="space-y-2">
                    {data.payment_options.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                        style={border}
                      >
                        <input
                          type="radio"
                          name="sf-payment"
                          checked={paymentOptionId === p.id}
                          onChange={() => setPaymentOptionId(p.id)}
                          className="h-4 w-4 accent-[var(--sf-primary)]"
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                    O pagamento é feito na entrega ou na retirada.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="sf-notes">Observações do pedido</Label>
                <Textarea
                  id="sf-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={300}
                  style={fieldStyle}
                />
              </div>

              <div className="rounded-lg border p-3 text-sm" style={border}>
                <Row label="Subtotal" value={formatCents(totals.subtotal)} />
                {isDelivery && <Row label="Entrega" value={formatCents(totals.deliveryFee)} />}
                {totals.serviceFee > 0 && <Row label="Taxa de serviço" value={formatCents(totals.serviceFee)} />}
                <Row label="Total" value={formatCents(totals.total)} strong />
              </div>

              {errors.length > 0 && (
                <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              {data.store.whatsapp_phone && (
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  style={{ borderColor: "var(--sf-border)", color: "var(--sf-text)", background: "transparent" }}
                  asChild
                >
                  <a
                    href={whatsappLink(data.store.whatsapp_phone, cartToWhatsappText(items, data.unit.name))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" /> Prefiro pedir pelo WhatsApp
                  </a>
                </Button>
              )}
            </div>

            <div className="sticky bottom-0 border-t p-3" style={{ ...surface, ...border }}>
              <Button
                className="h-12 w-full border-0 text-base"
                style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
                disabled={place.isPending || items.length === 0}
                onClick={submit}
              >
                {place.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar pedido · {formatCents(totals.total)}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${strong ? "font-semibold" : ""}`}>
      <span style={strong ? undefined : { color: "var(--sf-muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
