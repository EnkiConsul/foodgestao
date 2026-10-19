import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarioSemanaCabecalho } from "@/components/dp/calendario/CalendarioSemanaCabecalho";

/**
 * O cabeçalho da linha dos dias da semana do Início deve ter exatamente as
 * mesmas cores do calendário principal — o tamanho é a única diferença.
 */
function classesPorDia(diasDominicais: number[], compacto: boolean) {
  const { container } = render(<CalendarioSemanaCabecalho diasDominicais={diasDominicais} compacto={compacto} />);
  return Array.from(container.children).map((el) => el.className);
}

describe("CalendarioSemanaCabecalho — paridade de cores entre Início e calendário principal", () => {
  const diasDominicais = [0];

  it("domingo usa o verde oficial nos dois tamanhos", () => {
    const completo = classesPorDia(diasDominicais, false);
    const resumo = classesPorDia(diasDominicais, true);
    expect(completo[0]).toContain("bg-primary");
    expect(completo[0]).toContain("text-primary-foreground");
    expect(resumo[0]).toContain("bg-primary");
    expect(resumo[0]).toContain("text-primary-foreground");
  });

  it("dias úteis usam o fundo escuro oficial nos dois tamanhos", () => {
    const completo = classesPorDia(diasDominicais, false);
    const resumo = classesPorDia(diasDominicais, true);
    for (const i of [1, 2, 3, 4]) {
      expect(completo[i]).toContain("bg-calendar-header");
      expect(resumo[i]).toContain("bg-calendar-header");
      expect(resumo[i]).toContain("text-calendar-header-foreground");
    }
  });

  it("o resumo não volta ao fundo claro nem ao creme de pico na linha da semana", () => {
    const resumo = classesPorDia(diasDominicais, true);
    for (const cls of resumo) {
      expect(cls).not.toContain("bg-card");
      expect(cls).not.toContain("bg-calendar-pico");
    }
  });

  it("todos os dias mantêm a linha verde de base", () => {
    const resumo = classesPorDia(diasDominicais, true);
    expect(resumo).toHaveLength(7);
    for (const cls of resumo) expect(cls).toContain("border-b-2");
  });
});
