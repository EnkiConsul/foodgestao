import { describe, expect, it } from "vitest";
import { aceitaIndisponibilidadeConvocacao as ok } from "../convocacoes-planejamento";

describe("Indisponibilidade de Convocação — elegibilidade", () => {
  it("intermitente pode", () => expect(ok({ regime: "intermitente", forma_pagamento: "horista" })).toBe(true));
  it("freelancer diarista, horista e por turno podem", () => {
    for (const f of ["diarista", "horista", "por_turno", "servico_acordo"])
      expect(ok({ regime: "freelancer", forma_pagamento: f })).toBe(true);
  });
  it("freelancer mensalista não pode (rotina de CLT fixo)", () =>
    expect(ok({ regime: "freelancer", forma_pagamento: "mensalista" })).toBe(false));
  it("CLT fixo não pode", () => expect(ok({ regime: "clt", forma_pagamento: "mensalista" })).toBe(false));
});
