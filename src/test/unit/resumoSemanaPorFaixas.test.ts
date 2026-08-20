import { describe, it, expect } from "vitest";
import { resumoSemanaPorFaixas, type DiaConfig } from "@/lib/dp/config-trabalho";

const base = { entrada: "17:00", saida: "00:00", intervalo_minutos: 30 };

/** Semana completa; `overrides` define horário próprio por dia. */
function semana(
  overrides: Record<number, Partial<DiaConfig>> = {},
): DiaConfig[] {
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    trabalha: true,
    turno_id: null,
    ...(overrides[dow] ?? {}),
  }));
}

describe("resumoSemanaPorFaixas", () => {
  it("agrupa a semana inteira quando todos os dias usam o horário base", () => {
    expect(resumoSemanaPorFaixas(semana(), base)).toBe("Seg–Dom 17:00–00:00 (30 min)");
  });

  it("separa os dias de movimento com horário próprio", () => {
    const dias = semana({
      5: { entrada: "16:30", saida: "00:35", intervalo_minutos: 30 },
      6: { entrada: "16:30", saida: "00:35", intervalo_minutos: 30 },
      0: { entrada: "16:30", saida: "00:35", intervalo_minutos: 30 },
    });
    expect(resumoSemanaPorFaixas(dias, base)).toBe(
      "Seg–Qui 17:00–00:00 (30 min) · Sex–Dom 16:30–00:35 (30 min)",
    );
  });

  it("mostra a folga fixa no fim do resumo", () => {
    const dias = semana({ 4: { trabalha: false } });
    expect(resumoSemanaPorFaixas(dias, base)).toBe(
      "Seg–Qua 17:00–00:00 (30 min) · Sex–Dom 17:00–00:00 (30 min) · Folga: Qui",
    );
  });

  it("indica folga conforme escala quando a folga é variável", () => {
    const dias = semana({ 4: { trabalha: false } });
    const texto = resumoSemanaPorFaixas(dias, base, { folgaVariavel: true });
    expect(texto).toContain("folga conforme escala");
    expect(texto).not.toContain("Folga: Qui");
  });

  it("avisa quando o dia trabalhado não tem horário definido", () => {
    expect(resumoSemanaPorFaixas(semana(), null)).toBe("Seg–Dom sem horário definido");
  });
});
