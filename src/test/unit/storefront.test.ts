import { describe, expect, it } from "vitest";
import {
  cartItemTotal,
  cartSubtotal,
  cartToPayload,
  computeCartTotals,
  isValidSlug,
  slugify,
  validateCart,
  validateProductSelection,
  validateStorefront,
  type CartItem,
  type PublicProduct,
} from "@/lib/orders/storefront";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  key: "k",
  product_id: "p1",
  product_name: "X-Burger",
  variant_id: null,
  variant_name: null,
  unit_price_cents: 2500,
  quantity: 2,
  notes: null,
  options: [],
  image_path: null,
  ...over,
});

describe("slug da loja", () => {
  it("normaliza acentos e espaços", () => {
    expect(slugify("Hambúrgueria do Zé!")).toBe("hamburgueria-do-ze");
  });
  it("rejeita slugs curtos, reservados e mal formados", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("-loja")).toBe(false);
    expect(isValidSlug("mi--nha")).toBe(false);
    expect(isValidSlug("minha-loja")).toBe(true);
  });
});

describe("validateStorefront", () => {
  it("aceita configuração válida", () => {
    expect(
      validateStorefront({ slug: "minha-loja", primary_color: "#EB6119", theme: "classic", whatsapp_phone: "62999999999" }),
    ).toEqual([]);
  });
  it("acusa cor, tema e telefone inválidos", () => {
    const errors = validateStorefront({ slug: "x", primary_color: "laranja", theme: "neon", whatsapp_phone: "123" });
    expect(errors).toHaveLength(4);
  });
});

describe("totais do carrinho", () => {
  it("soma complementos por unidade", () => {
    const withOptions = item({
      options: [{ option_id: "o1", group_id: "g1", name: "Bacon", quantity: 1, price_cents: 500 }],
    });
    expect(cartItemTotal(withOptions)).toBe((2500 + 500) * 2);
    expect(cartSubtotal([withOptions, item({ key: "k2", quantity: 1 })])).toBe(6000 + 2500);
  });

  it("aplica frete só na entrega e taxa de serviço percentual", () => {
    const zone = { id: "z", name: "Centro", fee_amount: 700, min_order_amount: null, eta_minutes: 30, bairros: null };
    const delivery = computeCartTotals([item()], { zone, serviceFeePercent: 10, isDelivery: true });
    expect(delivery).toEqual({ subtotal: 5000, deliveryFee: 700, serviceFee: 500, total: 6200 });

    const pickup = computeCartTotals([item()], { zone, serviceFeePercent: 0, isDelivery: false });
    expect(pickup.deliveryFee).toBe(0);
    expect(pickup.total).toBe(5000);
  });
});

describe("validateCart", () => {
  const base = {
    items: [item()],
    orderType: "delivery",
    minOrderAmount: 0,
    zone: { id: "z", name: "Centro", fee_amount: 700, min_order_amount: null, eta_minutes: null, bairros: null },
    customerName: "Maria",
    customerPhone: "(62) 99999-9999",
    street: "Rua A",
    number: "10",
    paymentOptionId: "pay",
    requirePayment: true,
  };

  it("aceita pedido completo", () => {
    expect(validateCart(base)).toEqual([]);
  });

  it("exige endereço e região na entrega", () => {
    expect(validateCart({ ...base, zone: null, street: "" })).toEqual([
      "Selecione a região de entrega.",
      "Informe o endereço de entrega.",
    ]);
  });

  it("respeita pedido mínimo da loja e da região", () => {
    expect(validateCart({ ...base, minOrderAmount: 9000 }).join("|")).toMatch(/pedido mínimo é de R\$.90,00/);
    expect(
      validateCart({ ...base, zone: { ...base.zone, min_order_amount: 8000 } }).join("|"),
    ).toMatch(/região exige pedido mínimo de R\$.80,00/);
  });


  it("exige nome, telefone e forma de pagamento", () => {
    const errors = validateCart({ ...base, customerName: "M", customerPhone: "123", paymentOptionId: null });
    expect(errors).toContain("Informe seu nome.");
    expect(errors).toContain("Informe um telefone válido com DDD.");
    expect(errors).toContain("Selecione a forma de pagamento.");
  });
});

describe("validateProductSelection", () => {
  const product: PublicProduct = {
    id: "p1",
    name: "Pizza",
    description: null,
    image_path: null,
    sort_order: 1,
    allows_notes: true,
    price_cents: 4000,
    available: true,
    variants: [{ id: "v1", name: "Grande", price_cents: 5000, is_default: true }],
    option_groups: [
      {
        id: "g1",
        name: "Borda",
        is_required: true,
        min_choices: 1,
        max_choices: 1,
        options: [{ id: "o1", name: "Catupiry", description: null, price_cents: 800, max_quantity: null }],
      },
    ],
  };

  it("exige variação e grupo obrigatório", () => {
    expect(validateProductSelection(product, { variantId: null, options: [] })).toEqual([
      "Escolha uma opção de tamanho/variação.",
      'Escolha ao menos 1 item(ns) em "Borda".',
    ]);
  });

  it("aceita seleção completa", () => {
    expect(
      validateProductSelection(product, {
        variantId: "v1",
        options: [{ option_id: "o1", group_id: "g1", name: "Catupiry", quantity: 1, price_cents: 800 }],
      }),
    ).toEqual([]);
  });

  it("acusa excesso no grupo", () => {
    expect(
      validateProductSelection(product, {
        variantId: "v1",
        options: [
          { option_id: "o1", group_id: "g1", name: "Catupiry", quantity: 2, price_cents: 800 },
        ],
      }),
    ).toContain('Em "Borda" escolha no máximo 1 item(ns).');
  });
});

describe("cartToPayload", () => {
  it("envia apenas identificadores e quantidades ao servidor", () => {
    const payload = cartToPayload([
      item({
        variant_id: "v1",
        notes: "sem cebola",
        options: [{ option_id: "o1", group_id: "g1", name: "Bacon", quantity: 2, price_cents: 500 }],
      }),
    ]);
    expect(payload).toEqual([
      {
        product_id: "p1",
        variant_id: "v1",
        quantity: 2,
        notes: "sem cebola",
        options: [{ option_id: "o1", quantity: 2 }],
      },
    ]);
  });
});
