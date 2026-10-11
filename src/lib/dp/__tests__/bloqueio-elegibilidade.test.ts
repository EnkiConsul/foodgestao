import { describe, expect, it } from "vitest";
import { colaboradorElegivelBloqueio as e } from "../bloqueio-elegibilidade";

describe("colaboradorElegivelBloqueio", () => {
  it("CLT sem folga fixa no domingo entra", () => expect(e({ regime: "clt", folga_fixa_semana: [2] })).toBe(true));
  it("sócio fica fora", () => expect(e({ regime: "clt", vinculo_label: "socio" })).toBe(false));
  it("intermitente fica fora", () => expect(e({ regime: "intermitente" })).toBe(false));
  it("freelancer mensalista entra, diarista não", () => {
    expect(e({ regime: "freelancer", forma_pagamento: "mensalista" })).toBe(true);
    expect(e({ regime: "freelancer", forma_pagamento: "diarista" })).toBe(false);
  });
  it("folga fixa no domingo fica fora", () => expect(e({ regime: "clt", folga_fixa_semana: [0] })).toBe(false));
});
