import { describe, it, expect } from "vitest";
import { proximaEtapaUnidade } from "@/lib/dp/unidade-etapas";

describe("proximaEtapaUnidade", () => {
  it("avança na ordem Dados → Setores → Horários → Feriados → Sindicato", () => {
    expect(proximaEtapaUnidade("dados")).toBe("setores");
    expect(proximaEtapaUnidade("setores")).toBe("funcionamento");
    expect(proximaEtapaUnidade("funcionamento")).toBe("feriados");
    expect(proximaEtapaUnidade("feriados")).toBe("sindicato");
  });

  it("Sindicato é a última etapa", () => {
    expect(proximaEtapaUnidade("sindicato")).toBeNull();
  });
});
