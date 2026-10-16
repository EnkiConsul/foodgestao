import { describe, expect, it } from "vitest";
import { eixoDe } from "@/lib/dp/acoes-eixos";

describe("assunto das Ações do Dia", () => {
  it("atrasada vai para Críticas mesmo sendo de cadastro", () => {
    expect(eixoDe({ tipo: "Cadastro de Colaborador", atrasoDias: 2 })).toBe("criticas");
  });
  it("férias dentro do prazo continuam em Críticas", () => {
    expect(eixoDe({ tipo: "Férias", atrasoDias: -30 })).toBe("criticas");
  });
  it("escala no prazo vai para Equipe", () => {
    expect(eixoDe({ tipo: "Escala", atrasoDias: -3 })).toBe("equipe");
  });
  it("assinatura no prazo vai para Documentos", () => {
    expect(eixoDe({ tipo: "Assinaturas", atrasoDias: -3 })).toBe("documentos");
  });
  it("dependente no prazo vai para Cadastros", () => {
    expect(eixoDe({ tipo: "Dependente", atrasoDias: -3 })).toBe("cadastros");
  });
});
