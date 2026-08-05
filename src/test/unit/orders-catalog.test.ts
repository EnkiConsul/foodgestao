import { describe, expect, it } from "vitest";
import {
  buildProductImagePath,
  centsToInput,
  effectivePriceCents,
  formatCents,
  moveItem,
  parsePriceToCents,
  resolveAvailability,
  validateGroupRule,
  validateOptionSelection,
  validateProductImage,
} from "@/lib/orders/catalog";

const now = new Date("2026-08-05T12:00:00");

describe("preços (centavos, sem float)", () => {
  it("converte entradas em pt-BR e en-US", () => {
    expect(parsePriceToCents("12,50")).toBe(1250);
    expect(parsePriceToCents("12.50")).toBe(1250);
    expect(parsePriceToCents("1.234,56")).toBe(123456);
    expect(parsePriceToCents("R$ 9,90")).toBe(990);
    expect(parsePriceToCents("abc")).toBeNull();
  });

  it("formata e volta para input", () => {
    expect(formatCents(1250)).toBe("R$ 12,50");
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(centsToInput(990)).toBe("9,90");
  });

  it("preço efetivo: override de unidade > variação > base + complementos", () => {
    expect(effectivePriceCents({ basePriceCents: 1000 })).toBe(1000);
    expect(effectivePriceCents({ basePriceCents: 1000, variantPriceCents: 1800 })).toBe(1800);
    expect(effectivePriceCents({ basePriceCents: 1000, variantPriceCents: 1800, unitOverrideCents: 2000 })).toBe(2000);
    expect(effectivePriceCents({ basePriceCents: 1000, optionsCents: [200, 300] })).toBe(1500);
  });
});

describe("grupos de complementos", () => {
  it("valida mínimo e máximo", () => {
    expect(validateGroupRule({ is_required: true, min_choices: 0, max_choices: 2 })).toMatch(/obrigatório/i);
    expect(validateGroupRule({ is_required: false, min_choices: 3, max_choices: 2 })).toMatch(/mínimo/i);
    expect(validateGroupRule({ is_required: true, min_choices: 1, max_choices: 2 })).toBeNull();
  });

  it("grupo obrigatório exige seleção", () => {
    const groups = [{ id: "g1", name: "Ponto", is_required: true, min_choices: 1, max_choices: 1 }];
    expect(validateOptionSelection(groups, []).valid).toBe(false);
    expect(validateOptionSelection(groups, [{ groupId: "g1", quantity: 1 }]).valid).toBe(true);
    expect(validateOptionSelection(groups, [{ groupId: "g1", quantity: 2 }]).valid).toBe(false);
  });
});

describe("disponibilidade", () => {
  it("estados bloqueiam venda", () => {
    expect(resolveAvailability({ state: "draft" }, { unitId: null, channel: null, now }).reason).toBe("draft");
    expect(resolveAvailability({ state: "archived" }, { unitId: null, channel: null, now }).reason).toBe("archived");
    expect(resolveAvailability({ state: "paused" }, { unitId: null, channel: null, now }).reason).toBe("paused");
  });

  it("pausa temporária futura mantém indisponível", () => {
    const r = resolveAvailability(
      { state: "active", pausedUntil: "2026-08-05T18:00:00Z" },
      { unitId: null, channel: null, now: new Date("2026-08-05T12:00:00Z") },
    );
    expect(r.reason).toBe("paused");
  });

  it("estoque zerado bloqueia", () => {
    expect(resolveAvailability({ state: "active", trackStock: true, stockQuantity: 0 }, { unitId: null, channel: null, now }).reason).toBe("out_of_stock");
  });

  it("respeita janela de horário e dia", () => {
    const windows = [{ unit_id: null, channels: [], weekday: now.getDay(), starts_at: "18:00", ends_at: "23:00" }];
    expect(resolveAvailability({ state: "active", windows }, { unitId: null, channel: null, now }).reason).toBe("out_of_window");
    expect(
      resolveAvailability({ state: "active", windows }, { unitId: null, channel: null, now: new Date("2026-08-05T19:00:00") }).available,
    ).toBe(true);
  });

  it("estado por unidade sobrepõe o produto", () => {
    expect(resolveAvailability({ state: "active", unitState: "paused" }, { unitId: "u1", channel: null, now }).reason).toBe("paused");
  });

  it("janela de outra unidade não afeta a unidade atual", () => {
    const windows = [{ unit_id: "u2", channels: [], weekday: 1, starts_at: "01:00", ends_at: "02:00" }];
    expect(resolveAvailability({ state: "active", windows }, { unitId: "u1", channel: null, now }).available).toBe(true);
  });
});

describe("imagens", () => {
  it("recusa extensão, mime e tamanho inválidos", () => {
    expect(validateProductImage({ name: "a.pdf", size: 1000, type: "application/pdf" })).toMatch(/Formato/);
    expect(validateProductImage({ name: "a.png", size: 1000, type: "text/plain" })).toMatch(/não permitido/);
    expect(validateProductImage({ name: "a.png", size: 6 * 1024 * 1024, type: "image/png" })).toMatch(/5 MB/);
    expect(validateProductImage({ name: "a.png", size: 2000, type: "image/png" })).toBeNull();
  });

  it("path sempre começa pela empresa", () => {
    const path = buildProductImagePath("comp-1", "prod-1", "foto.PNG");
    expect(path.startsWith("comp-1/prod-1/")).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
  });
});

describe("ordenação", () => {
  it("move item preservando os demais", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});
