import { describe, expect, it } from "vitest";
import { argsTrocaGestor, trocaExigeTermo } from "@/lib/dp/troca-gestor";

describe("troca registrada pelo gestor", () => {
  it("não exige termo/assinatura no ajuste administrativo", () => {
    expect(trocaExigeTermo({ origem_registro: "gestor" })).toBe(false);
  });
  it("preserva exigência do fluxo de portal e do legado", () => {
    expect(trocaExigeTermo({ origem_registro: "portal" })).toBe(true);
    expect(trocaExigeTermo({})).toBe(true);
  });
  it("envia as duas pessoas, as duas folgas e a empresa sem inventar aceite", () => {
    expect(argsTrocaGestor({companyId:"empresa",solicitanteId:"hanna",destinoId:"provisorio",dataOriginal:"2026-10-26",dataProposta:"2026-10-29"})).toEqual({_company:"empresa",_sol:"hanna",_dest:"provisorio",_original:"2026-10-26",_proposta:"2026-10-29"});
  });
});