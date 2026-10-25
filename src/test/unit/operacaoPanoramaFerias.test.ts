import { describe, expect, it } from "vitest";
import { STATUS_GOZO_VISIVEL_OPERACAO } from "@/lib/dp/operacao-panorama";

// Regressão: férias com status "concluido" (encerradas antes de hoje) devem
// continuar contando como ausência nos dias passados do mês e do baseline.
// Sem isso, a pessoa reaparece como escalada nos dias em que estava de férias.
describe("panorama da operação — férias concluídas", () => {
  it("inclui férias concluídas como ausência visível", () => {
    expect(STATUS_GOZO_VISIVEL_OPERACAO).toContain("concluido");
  });

  it("mantém aprovadas e em gozo visíveis", () => {
    expect(STATUS_GOZO_VISIVEL_OPERACAO).toContain("aprovado");
    expect(STATUS_GOZO_VISIVEL_OPERACAO).toContain("em_gozo");
  });

  it("não inclui canceladas nem apenas planejadas", () => {
    expect(STATUS_GOZO_VISIVEL_OPERACAO).not.toContain("cancelado");
    expect(STATUS_GOZO_VISIVEL_OPERACAO).not.toContain("planejado");
  });
});
