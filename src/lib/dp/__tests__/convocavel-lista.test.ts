import { describe, expect, it } from "vitest";
import { pessoaConvocavel } from "../convocacoes-planejamento";

describe("pessoaConvocavel (lista de opções de convocação)", () => {
  it("intermitente é sempre convocável, independente da forma de pagamento", () => {
    expect(pessoaConvocavel({ regime: "intermitente", forma_pagamento: "horista" })).toBe(true);
    expect(pessoaConvocavel({ regime: "intermitente", forma_pagamento: null })).toBe(true);
  });

  it("freelancer horista ou diarista é convocável", () => {
    expect(pessoaConvocavel({ regime: "freelancer", forma_pagamento: "horista" })).toBe(true);
    expect(pessoaConvocavel({ regime: "freelancer", forma_pagamento: "diarista" })).toBe(true);
  });

  it("freelancer mensalista NÃO aparece como opção de convocação", () => {
    expect(pessoaConvocavel({ regime: "freelancer", forma_pagamento: "mensalista" })).toBe(false);
    expect(pessoaConvocavel({ regime: "freelancer", forma_pagamento: null })).toBe(false);
    expect(pessoaConvocavel({ regime: "freelancer", forma_pagamento: undefined })).toBe(false);
  });

  it("demais vínculos nunca são convocáveis", () => {
    for (const regime of ["clt", "estagio", "temporario", "pj", "mei", null, undefined]) {
      expect(pessoaConvocavel({ regime, forma_pagamento: "horista" })).toBe(false);
    }
  });
});
