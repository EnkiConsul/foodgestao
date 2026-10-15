import { describe, it, expect } from "vitest";
import { diretrizPonto } from "@/lib/dp/ocorrencias";

const base = { origem: "gestor", analise_status: "pendente", impacta_assiduidade: "nao", tratativa_ponto: false, tratativa_status: null };
describe("diretrizPonto", () => {
  it("atestado aprovado pelo sistema é abonar", () => {
    expect(diretrizPonto({ ...base, tipo: "ausencia_justificada", estado: "confirmada", origem: "sistema", analise_status: "analisada", impacta_assiduidade: "sim", tratativa_ponto: true, tratativa_status: "pendente" })).toBe("abonar");
  });
  it("falta confirmada é descontar", () => {
    expect(diretrizPonto({ ...base, tipo: "falta", estado: "confirmada" })).toBe("descontar");
  });
  it("esquecimento é ajustar batida", () => {
    expect(diretrizPonto({ ...base, tipo: "esquecimento_marcacao", estado: "confirmada" })).toBe("ajustar");
  });
  it("previsão é a decidir", () => {
    expect(diretrizPonto({ ...base, tipo: "previsao_falta", estado: "informada" })).toBe("decidir");
  });
  it("cancelada fica fora", () => {
    expect(diretrizPonto({ ...base, tipo: "falta", estado: "cancelada" })).toBeNull();
  });
});
