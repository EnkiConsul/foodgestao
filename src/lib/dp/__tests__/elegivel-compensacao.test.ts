import { describe, it, expect } from "vitest";
import { elegivelCompensacao } from "@/lib/dp/compensacao/filtroCalculadora";

describe("elegibilidade da calculadora", () => {
  it("unidade sem banco nem feriados: fora", () => expect(elegivelCompensacao({ banco_horas: false, compensa_feriados: false }, undefined)).toBe(false));
  it("unidade com banco: dentro", () => expect(elegivelCompensacao({ banco_horas: true }, undefined)).toBe(true));
  it("exceção individual desliga o banco", () => expect(elegivelCompensacao({ banco_horas: true }, { usa_banco_horas: false })).toBe(false));
  it("exceção NULL segue a unidade", () => expect(elegivelCompensacao({ compensa_feriados: true }, { usa_compensa_feriados: null })).toBe(true));
});
