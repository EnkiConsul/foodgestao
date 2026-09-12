import { describe, expect, it } from "vitest";
import { destinoGestoEsquerda, DP_ANALYTICS_ROUTE, HUB_ROUTE } from "../edgeGestureTargets";

describe("destinoGestoEsquerda", () => {
  it("abre o Hub na tela inicial de Pessoas quando há mais de um módulo", () => {
    expect(
      destinoGestoEsquerda({ activeModule: "dp", pathname: "/dp", homeTo: "/dp", modulosAtivos: 2 }),
    ).toEqual({ tipo: "navegar", to: HUB_ROUTE });
  });

  it("abre o Analytics de Pessoas quando só há um módulo", () => {
    expect(
      destinoGestoEsquerda({ activeModule: "dp", pathname: "/dp", homeTo: "/dp", modulosAtivos: 1 }),
    ).toEqual({ tipo: "navegar", to: DP_ANALYTICS_ROUTE });
  });

  it("mantém voltar nas telas internas de Pessoas", () => {
    expect(
      destinoGestoEsquerda({ activeModule: "dp", pathname: "/dp/ferias", homeTo: "/dp", modulosAtivos: 3 }),
    ).toEqual({ tipo: "voltar" });
  });

  it("na tela Mais, o gesto volta para a tela anterior", () => {
    expect(
      destinoGestoEsquerda({
        activeModule: "dp",
        pathname: "/dp/mais",
        homeTo: "/dp",
        moreTo: "/dp/mais",
        modulosAtivos: 2,
      }),
    ).toEqual({ tipo: "voltar" });
  });

  it("não muda nada nos outros módulos", () => {
    expect(
      destinoGestoEsquerda({
        activeModule: "portal_colaborador",
        pathname: "/dp/meu",
        homeTo: "/dp/meu",
        modulosAtivos: 3,
      }),
    ).toEqual({ tipo: "voltar" });
    expect(
      destinoGestoEsquerda({
        activeModule: "financeiro",
        pathname: "/dashboard",
        homeTo: "/dashboard",
        modulosAtivos: 3,
      }),
    ).toEqual({ tipo: "voltar" });
  });
});
