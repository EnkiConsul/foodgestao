import { describe, it, expect } from "vitest";
import { proximaEtapa, urlPortal } from "./portal";
import { destinoSeguro } from "./candidato";

describe("entrada no Banco de Talentos", () => {
  it("sem login vai para o acesso", () => expect(proximaEtapa(false, null)).toBe("login"));
  it("sem perfil completo vai para o perfil", () =>
    expect(proximaEtapa(true, { tem_perfil: true, perfil_completo: false })).toBe("perfil"));
  it("sem avaliação válida não autoriza", () =>
    expect(proximaEtapa(true, { tem_perfil: true, perfil_completo: true, avaliacao_valida: false })).toBe("avaliacao"));
  it("com avaliação pede autorização", () =>
    expect(proximaEtapa(true, { tem_perfil: true, perfil_completo: true, avaliacao_valida: true, vinculo: null })).toBe("autorizar"));
  it("retirado precisa autorizar de novo", () =>
    expect(proximaEtapa(true, { tem_perfil: true, perfil_completo: true, avaliacao_valida: true, vinculo: "retirado" })).toBe("autorizar"));
});

describe("link permanente", () => {
  it("usa o domínio oficial", () => expect(urlPortal("pakere")).toBe("https://aveto360.com/carreiras/pakere"));
  it("aceita voltar ao portal após login", () =>
    expect(destinoSeguro("/carreiras/pakere/talentos")).toBe("/carreiras/pakere/talentos"));
});
