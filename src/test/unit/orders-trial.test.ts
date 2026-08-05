import { describe, expect, it } from "vitest";
import {
  buildOrdersExportCsv,
  formatTrialDeadline,
  formatTrialTimeLeft,
  isConsultaMode,
  ordersTrialCountdown,
  retentionWindow,
  summarizeTrialUsage,
} from "@/lib/orders/trial";

const NOW = new Date("2026-03-10T12:00:00.000Z");

describe("ordersTrialCountdown", () => {
  it("fail closed sem data de término", () => {
    const c = ordersTrialCountdown(null, NOW);
    expect(c.expired).toBe(true);
    expect(c.level).toBe("expired");
  });

  it("considera expirado no instante do vencimento", () => {
    expect(ordersTrialCountdown("2026-03-10T12:00:00.000Z", NOW).expired).toBe(true);
  });

  it("classifica níveis por proximidade", () => {
    expect(ordersTrialCountdown("2026-03-16T12:00:00.000Z", NOW).level).toBe("info");
    expect(ordersTrialCountdown("2026-03-12T06:00:00.000Z", NOW).level).toBe("warning");
    expect(ordersTrialCountdown("2026-03-10T19:30:00.000Z", NOW).level).toBe("critical");
  });

  it("marca o último dia e calcula horas restantes", () => {
    const c = ordersTrialCountdown("2026-03-10T19:30:00.000Z", NOW);
    expect(c.isLastDay).toBe(true);
    expect(c.hoursLeft).toBe(7);
    expect(c.minutesLeft).toBe(30);
  });
});

describe("formatTrialTimeLeft", () => {
  it("mostra dias fora do último dia", () => {
    expect(formatTrialTimeLeft(ordersTrialCountdown("2026-03-13T12:00:00.000Z", NOW))).toBe("3 dias");
  });
  it("mostra horas e minutos no último dia", () => {
    expect(formatTrialTimeLeft(ordersTrialCountdown("2026-03-10T19:30:00.000Z", NOW))).toBe("7 h 30 min");
  });
  it("mostra minutos na última hora", () => {
    expect(formatTrialTimeLeft(ordersTrialCountdown("2026-03-10T12:40:00.000Z", NOW))).toBe("40 min");
  });
  it("indica encerrado", () => {
    expect(formatTrialTimeLeft(ordersTrialCountdown(null, NOW))).toBe("encerrado");
  });
});

describe("formatTrialDeadline", () => {
  it("retorna null para valores inválidos", () => {
    expect(formatTrialDeadline(null)).toBeNull();
    expect(formatTrialDeadline("não-é-data")).toBeNull();
  });
  it("formata data e hora", () => {
    expect(formatTrialDeadline("2026-03-10T12:00:00.000Z")).toMatch(/10\/03\/2026/);
  });
});

describe("isConsultaMode", () => {
  it("cobre estados de somente leitura", () => {
    expect(isConsultaMode("trial_expirado")).toBe(true);
    expect(isConsultaMode("suspended")).toBe(true);
    expect(isConsultaMode("canceled")).toBe(true);
    expect(isConsultaMode("trial")).toBe(false);
    expect(isConsultaMode("active")).toBe(false);
  });
});

describe("retentionWindow", () => {
  it("null sem expiração", () => {
    expect(retentionWindow(null, 180, NOW)).toBeNull();
  });
  it("usa 180 dias por padrão", () => {
    const w = retentionWindow("2026-03-01T00:00:00.000Z", null, NOW)!;
    expect(w.daysRemaining).toBe(171);
  });
  it("não retorna dias negativos", () => {
    const w = retentionWindow("2024-01-01T00:00:00.000Z", 30, NOW)!;
    expect(w.daysRemaining).toBe(0);
  });
});

describe("summarizeTrialUsage", () => {
  it("preenche zeros quando ausente", () => {
    const rows = summarizeTrialUsage(null);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });
});

describe("buildOrdersExportCsv", () => {
  it("gera BOM, cabeçalho e escapes", () => {
    const csv = buildOrdersExportCsv([
      {
        display_number: 12,
        status: "completed",
        customer_name: 'Bar; "Central"',
        is_test: false,
        total_amount: 90.5,
        notes: "linha1\nlinha2",
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Pedido;Data;Status");
    expect(csv).toContain('"Bar; ""Central"""');
    expect(csv).toContain("Não");
  });

  it("exporta apenas cabeçalho sem linhas", () => {
    expect(buildOrdersExportCsv([]).split("\n")).toHaveLength(1);
  });
});
