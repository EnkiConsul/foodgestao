import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTrackPublicOrder } from "@/hooks/usePublicStorefront";
import { ORDER_TYPE_LABELS, PUBLIC_STATUS_LABELS, formatCents, onlyDigits } from "@/lib/orders/storefront";

const STEPS = [
  { key: "placed_at", label: "Pedido recebido" },
  { key: "accepted_at", label: "Confirmado pela loja" },
  { key: "ready_at", label: "Pronto" },
  { key: "dispatched_at", label: "Saiu para entrega" },
  { key: "delivered_at", label: "Entregue" },
] as const;

export default function StorefrontTrackDialog({
  slug,
  initialNumber,
  initialPhone,
  trigger,
}: {
  slug: string;
  initialNumber?: number | null;
  initialPhone?: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [numberInput, setNumberInput] = useState(initialNumber ? String(initialNumber) : "");
  const [phoneInput, setPhoneInput] = useState(initialPhone ?? "");
  const [query, setQuery] = useState<{ number: number; phone: string } | null>(
    initialNumber && initialPhone ? { number: initialNumber, phone: initialPhone } : null,
  );

  const { data, isFetching } = useTrackPublicOrder(slug, query?.number ?? null, query?.phone ?? null);
  const order = data && data.found ? data : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-md border-0"
        style={{ background: "var(--sf-surface)", color: "var(--sf-text)" }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--sf-text)" }}>Acompanhar pedido</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="track-number">Nº do pedido</Label>
              <Input
                id="track-number"
                value={numberInput}
                onChange={(e) => setNumberInput(onlyDigits(e.target.value))}
                inputMode="numeric"
                style={{ background: "var(--sf-bg)", borderColor: "var(--sf-border)", color: "var(--sf-text)" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="track-phone">Telefone</Label>
              <Input
                id="track-phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                inputMode="tel"
                style={{ background: "var(--sf-bg)", borderColor: "var(--sf-border)", color: "var(--sf-text)" }}
              />
            </div>
          </div>
          <Button
            className="w-full border-0"
            style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
            disabled={!numberInput || onlyDigits(phoneInput).length < 10}
            onClick={() => setQuery({ number: Number(numberInput), phone: phoneInput })}
          >
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buscar
          </Button>

          {query && !isFetching && !order && (
            <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
              Não encontramos esse pedido. Confira o número e o telefone informados no pedido.
            </p>
          )}

          {order && (
            <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--sf-border)" }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">#{order.display_number}</p>
                <span className="text-sm" style={{ color: "var(--sf-primary)" }}>
                  {PUBLIC_STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--sf-muted)" }}>
                {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type} · {formatCents(order.total_amount)}
                {order.pickup_code ? ` · código ${order.pickup_code}` : ""}
              </p>

              {order.cancelled_at ? (
                <p className="text-sm text-destructive">Pedido cancelado.</p>
              ) : (
                <ol className="space-y-2">
                  {STEPS.filter(
                    (s) => order.order_type === "delivery" || (s.key !== "dispatched_at" && s.key !== "delivered_at"),
                  ).map((s) => {
                    const done = Boolean(order[s.key]);
                    return (
                      <li key={s.key} className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: done ? "var(--sf-primary)" : "var(--sf-border)" }}
                        />
                        <span style={done ? undefined : { color: "var(--sf-muted)" }}>{s.label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              <ul className="space-y-1 border-t pt-2 text-xs" style={{ borderColor: "var(--sf-border)" }}>
                {order.items.map((i, idx) => (
                  <li key={`${i.name}-${idx}`} className="flex justify-between gap-2">
                    <span>
                      {i.quantity}x {i.name}
                    </span>
                    <span>{formatCents(i.total_price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
