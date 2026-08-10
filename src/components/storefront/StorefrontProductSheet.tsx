import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  cartItemUnitTotal,
  formatCents,
  storefrontMediaUrl,
  themeStyle,
  validateProductSelection,
  type CartItem,
  type CartOption,
  type PublicProduct,
  type StorefrontTheme,
} from "@/lib/orders/storefront";

interface Props {
  slug: string;
  product: PublicProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: CartItem) => void;
  /** Tema da loja — o Sheet vive num portal fora da página, precisa das variáveis aqui. */
  theme: StorefrontTheme;
  primaryColor: string;
}

export default function StorefrontProductSheet({
  slug,
  product,
  open,
  onOpenChange,
  onAdd,
  theme,
  primaryColor,
}: Props) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [options, setOptions] = useState<CartOption[]>([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);

  // Reinicia a seleção sempre que outro produto é aberto.
  const productKey = product?.id ?? "";
  const [lastKey, setLastKey] = useState("");
  if (productKey !== lastKey) {
    setLastKey(productKey);
    setVariantId(product?.variants.find((v) => v.is_default)?.id ?? (product?.variants[0]?.id ?? null));
    setOptions([]);
    setNotes("");
    setQuantity(1);
    setErrors([]);
  }

  const basePrice = useMemo(() => {
    if (!product) return 0;
    const variant = product.variants.find((v) => v.id === variantId);
    return variant ? variant.price_cents : product.price_cents;
  }, [product, variantId]);

  const draft: CartItem | null = product
    ? {
        key: `${product.id}-${variantId ?? "base"}-${options.map((o) => `${o.option_id}x${o.quantity}`).join("_")}-${notes}`,
        product_id: product.id,
        product_name: product.name,
        variant_id: variantId,
        variant_name: product.variants.find((v) => v.id === variantId)?.name ?? null,
        unit_price_cents: basePrice,
        quantity,
        notes: notes.trim() || null,
        options,
        image_path: product.image_path,
      }
    : null;

  const toggleOption = (groupId: string, option: { id: string; name: string; price_cents: number; max_quantity: number | null }, maxChoices: number | null) => {
    setOptions((prev) => {
      const existing = prev.find((o) => o.option_id === option.id);
      if (existing) return prev.filter((o) => o.option_id !== option.id);
      const inGroup = prev.filter((o) => o.group_id === groupId);
      const next: CartOption = {
        option_id: option.id,
        group_id: groupId,
        name: option.name,
        quantity: 1,
        price_cents: option.price_cents,
      };
      if (maxChoices === 1) return [...prev.filter((o) => o.group_id !== groupId), next];
      if (maxChoices && inGroup.reduce((s, o) => s + o.quantity, 0) >= maxChoices) return prev;
      return [...prev, next];
    });
  };

  const submit = () => {
    if (!product || !draft) return;
    const found = validateProductSelection(product, { variantId, options });
    setErrors(found);
    if (found.length > 0) return;
    onAdd(draft);
    onOpenChange(false);
  };

  if (!product) return null;
  const image = storefrontMediaUrl(slug, "ped-produtos", product.image_path);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl border-0 p-0 sm:max-w-lg sm:rounded-2xl"
        style={{
          ...themeStyle(theme, primaryColor),
          background: "var(--sf-surface)",
          color: "var(--sf-text)",
          fontFamily: "var(--sf-font-body)",
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {image && (
          <img
            src={image}
            alt={product.name}
            className="h-40 w-full flex-none object-cover sm:h-48"
            loading="lazy"
          />
        )}
        <div className="space-y-5 p-4 pb-6">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle style={{ color: "var(--sf-text)" }}>{product.name}</SheetTitle>
            {product.description && (
              <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
                {product.description}
              </p>
            )}
            <p className="text-sm font-semibold" style={{ color: "var(--sf-primary)" }}>
              {formatCents(product.price_cents)}
            </p>
          </SheetHeader>

          {product.variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Escolha uma opção</p>
              {product.variants.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--sf-border)" }}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="sf-variant"
                      checked={variantId === v.id}
                      onChange={() => setVariantId(v.id)}
                      className="h-4 w-4 accent-[var(--sf-primary)]"
                    />
                    {v.name}
                  </span>
                  <span style={{ color: "var(--sf-muted)" }}>{formatCents(v.price_cents)}</span>
                </label>
              ))}
            </div>
          )}

          {product.option_groups.map((group) => {
            const chosen = options.filter((o) => o.group_id === group.id).reduce((s, o) => s + o.quantity, 0);
            return (
              <div key={group.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{group.name}</p>
                  <span className="text-xs" style={{ color: "var(--sf-muted)" }}>
                    {group.is_required ? "Obrigatório" : "Opcional"}
                    {group.max_choices ? ` · até ${group.max_choices}` : ""}
                    {group.max_choices ? ` (${chosen}/${group.max_choices})` : ""}
                  </span>
                </div>
                {group.options.map((op) => {
                  const selected = options.some((o) => o.option_id === op.id);
                  return (
                    <label
                      key={op.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                      style={{ borderColor: "var(--sf-border)" }}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={group.max_choices === 1 ? "radio" : "checkbox"}
                          name={`group-${group.id}`}
                          checked={selected}
                          onChange={() => toggleOption(group.id, op, group.max_choices)}
                          className="h-4 w-4 accent-[var(--sf-primary)]"
                        />
                        <span>
                          {op.name}
                          {op.description && (
                            <span className="block text-xs" style={{ color: "var(--sf-muted)" }}>
                              {op.description}
                            </span>
                          )}
                        </span>
                      </span>
                      <span style={{ color: "var(--sf-muted)" }}>
                        {op.price_cents > 0 ? `+ ${formatCents(op.price_cents)}` : "grátis"}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}

          {product.allows_notes && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Observações</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ex.: sem cebola"
                style={{ background: "var(--sf-bg)", borderColor: "var(--sf-border)", color: "var(--sf-text)" }}
              />
            </div>
          )}

          {errors.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        </div>

        <div
          className="flex flex-none items-center gap-3 border-t p-3"
          style={{ background: "var(--sf-surface)", borderColor: "var(--sf-border)" }}
        >
          <div
            className="flex items-center gap-2 rounded-full border px-2 py-1"
            style={{ borderColor: "var(--sf-border)" }}
          >
            <button
              type="button"
              aria-label="Diminuir quantidade"
              className="p-1 disabled:opacity-40"
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-6 text-center text-sm font-semibold">{quantity}</span>
            <button
              type="button"
              aria-label="Aumentar quantidade"
              className="p-1"
              onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button
            className="h-11 flex-1 border-0"
            style={{ background: "var(--sf-primary)", color: "var(--sf-on-primary)" }}
            disabled={!product.available}
            onClick={submit}
          >
            {product.available
              ? `Adicionar · ${formatCents(draft ? cartItemUnitTotal(draft) * quantity : 0)}`
              : "Indisponível"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
