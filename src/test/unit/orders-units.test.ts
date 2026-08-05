import { describe, expect, it } from "vitest";
import {
  CHECKLIST_ITEMS,
  isChecklistReady,
  isValidMenuUrl,
  missingChecklistItems,
  onboardingProgress,
  validateHourExceptions,
  validateHourPeriods,
  validateUnitIdentity,
} from "@/lib/orders/units";

const allTrue = Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, true]));

describe("horários da unidade", () => {
  it("aceita múltiplos períodos no mesmo dia sem sobreposição", () => {
    expect(
      validateHourPeriods([
        { weekday: 1, opens_at: "11:00", closes_at: "15:00" },
        { weekday: 1, opens_at: "18:00", closes_at: "23:00" },
        { weekday: 2, opens_at: "11:00", closes_at: "23:00" },
      ]),
    ).toEqual([]);
  });

  it("rejeita sobreposição no mesmo dia", () => {
    const errors = validateHourPeriods([
      { weekday: 3, opens_at: "11:00", closes_at: "16:00" },
      { weekday: 3, opens_at: "15:00", closes_at: "22:00" },
    ]);
    expect(errors.join(" ")).toMatch(/sobrepostos/i);
  });

  it("rejeita fechamento antes da abertura e horário inválido", () => {
    expect(validateHourPeriods([{ weekday: 0, opens_at: "22:00", closes_at: "02:00" }]).length).toBe(1);
    expect(validateHourPeriods([{ weekday: 0, opens_at: "25:00", closes_at: "26:00" }]).length).toBe(1);
  });

  it("exige ao menos um período", () => {
    expect(validateHourPeriods([]).length).toBe(1);
  });

  it("valida exceções de calendário", () => {
    expect(validateHourExceptions([{ exception_date: "2026-12-25", is_closed: true }])).toEqual([]);
    expect(
      validateHourExceptions([{ exception_date: "2026-12-25", is_closed: false, opens_at: "18:00", closes_at: "17:00" }])
        .length,
    ).toBe(1);
    expect(
      validateHourExceptions([
        { exception_date: "2026-12-25", is_closed: true },
        { exception_date: "2026-12-25", is_closed: true },
      ]).join(" "),
    ).toMatch(/repetida/i);
  });
});

describe("identidade da unidade", () => {
  it("exige nome e fuso válido", () => {
    expect(validateUnitIdentity({ nome: "Matriz", timezone: "America/Sao_Paulo" })).toEqual([]);
    expect(validateUnitIdentity({ nome: "  ", timezone: "America/Sao_Paulo" }).length).toBe(1);
    expect(validateUnitIdentity({ nome: "Matriz", timezone: "Marte/Olympus" }).length).toBe(1);
  });

  it("limita código interno e UF", () => {
    expect(validateUnitIdentity({ nome: "X", timezone: "America/Manaus", codigo_interno: "a".repeat(31) }).length).toBe(1);
    expect(validateUnitIdentity({ nome: "X", timezone: "America/Manaus", uf: "GOI" }).length).toBe(1);
  });

  it("valida link de cardápio", () => {
    expect(isValidMenuUrl("https://cardapio.exemplo.com/loja")).toBe(true);
    expect(isValidMenuUrl("cardapio.exemplo.com")).toBe(false);
  });
});

describe("checklist e progresso", () => {
  it("só está pronto com todos os itens obrigatórios", () => {
    expect(isChecklistReady(allTrue)).toBe(true);
    expect(isChecklistReady({ ...allTrue, test_order: false })).toBe(false);
    expect(isChecklistReady({})).toBe(false);
    expect(missingChecklistItems({ ...allTrue, payment: false })).toEqual(["payment"]);
  });

  it("bloqueia abertura com trial expirado (assinatura inválida)", () => {
    expect(isChecklistReady({ ...allTrue, subscription_valid: false })).toBe(false);
  });

  it("bloqueia abertura de unidade suspensa", () => {
    expect(isChecklistReady({ ...allTrue, unit_not_suspended: false })).toBe(false);
  });

  it("progresso acompanha as etapas e conclui na ativação", () => {
    expect(onboardingProgress(1, false)).toBe(0);
    expect(onboardingProgress(3, false)).toBe(50);
    expect(onboardingProgress(2, true)).toBe(100);
    expect(onboardingProgress(5, false)).toBe(100);
  });
});
