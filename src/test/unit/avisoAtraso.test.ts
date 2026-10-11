import { describe, it, expect } from "vitest";
import { avisoAtrasoAntesDeEnviar } from "@/lib/dp/assiduidade-risco";

const regra = { premio_assiduidade: true, premio_assiduidade_valor: 100, assiduidade_tolerancia_min: 10, assiduidade_max_atrasos: 2 } as never;

describe("aviso de atraso no portal", () => {
  it("dentro da tolerância diária não avisa", () => {
    expect(avisoAtrasoAntesDeEnviar(regra, [], { data: "2026-10-05", tipo: "atraso", minutos: 8 })).toBeNull();
  });
  it("soma entrada e retorno do intervalo no mesmo dia", () => {
    const mes = [{ data_operacional: "2026-10-05", tipo: "atraso" as const, minutos: 6 }];
    expect(avisoAtrasoAntesDeEnviar(regra, mes, { data: "2026-10-05", tipo: "atraso_intervalo", minutos: 7 })).toContain("1 de 2");
  });
  it("terceiro dia acima da tolerância avisa risco de perda", () => {
    const mes = [
      { data_operacional: "2026-10-01", tipo: "atraso" as const, minutos: 15 },
      { data_operacional: "2026-10-02", tipo: "atraso" as const, minutos: 15 },
    ];
    expect(avisoAtrasoAntesDeEnviar(regra, mes, { data: "2026-10-05", tipo: "atraso", minutos: 15 })).toContain("pode perder");
  });
});
