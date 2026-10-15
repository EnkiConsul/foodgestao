import { describe, expect, it } from "vitest";
import { tratativaPendente } from "@/lib/dp/ocorrencias";

const base = {
  tipo: "ausencia_justificada", estado: "confirmada", origem: "sistema",
  analise_status: "analisada", impacta_assiduidade: "sim",
  tratativa_ponto: true, tratativa_status: "pendente",
};

describe("tratativa de ponto", () => {
  it("atestado aprovado com assiduidade decidida não fica a tratar", () => {
    expect(tratativaPendente(base)).toBe(false);
  });
  it("atestado com assiduidade ainda aguardando continua a tratar", () => {
    expect(tratativaPendente({ ...base, impacta_assiduidade: "aguardando" })).toBe(true);
  });
  it("atraso registrado pelo gestor continua a tratar", () => {
    expect(tratativaPendente({ ...base, tipo: "atraso", origem: "gestor" })).toBe(true);
  });
});
