import { describe, it, expect } from "vitest";

import {
  detectarAlteracoesContratuais,
  alertasAlteracaoContratual,
  temRiscoAlto,
  type SnapshotContratual,
} from "@/lib/dp/alteracao-contratual";

const clt: SnapshotContratual = {
  regime: "clt",
  vinculo_label: "CLT",
  cargo_id: "c1",
  unidade_id: "u1",
  forma_pagamento: "mensalista",
  salario_base: 2000,
  vale_transporte: true,
  premio_assiduidade: true,
  possui_folha_ponto: true,
  optante_adiantamento: true,
};

describe("detectarAlteracoesContratuais", () => {
  it("não acusa mudança quando nada muda", () => {
    expect(detectarAlteracoesContratuais(clt, { ...clt })).toEqual([]);
  });

  it("lista cargo, salário e ponto com os nomes dos cadastros", () => {
    const itens = detectarAlteracoesContratuais(
      clt,
      { ...clt, cargo_id: "c2", salario_base: 2500, possui_folha_ponto: false },
      { cargo: (id) => (id === "c1" ? "GARÇOM" : "CHEFE DE COZINHA") },
    );
    const campos = itens.map((i) => i.campo);
    expect(campos).toContain("cargo");
    expect(campos).toContain("salario_base");
    expect(campos).toContain("possui_folha_ponto");
    const cargo = itens.find((i) => i.campo === "cargo")!;
    expect(cargo.de).toBe("GARÇOM");
    expect(cargo.para).toBe("CHEFE DE COZINHA");
  });
});

describe("alertasAlteracaoContratual", () => {
  it("alerta risco alto ao sair de vínculo formal sem rescisão", () => {
    const alertas = alertasAlteracaoContratual(clt, {
      ...clt,
      regime: "freelancer",
      vinculo_label: "Freelancer",
      possui_folha_ponto: false,
      optante_adiantamento: false,
    });
    expect(temRiscoAlto(alertas)).toBe(true);
    expect(alertas[0].titulo).toContain("vínculo formal");
  });

  it("alerta ponto e adiantamento em vínculo sem registro", () => {
    const freela: SnapshotContratual = { ...clt, regime: "freelancer", vinculo_label: "Freelancer" };
    const alertas = alertasAlteracaoContratual(freela, freela);
    const titulos = alertas.map((a) => a.titulo);
    expect(titulos.some((t) => t.includes("Controle de ponto"))).toBe(true);
    expect(titulos.some((t) => t.includes("Adiantamento"))).toBe(true);
  });

  it("alerta redução de salário e retirada de benefício em vínculo formal", () => {
    const alertas = alertasAlteracaoContratual(clt, {
      ...clt,
      salario_base: 1800,
      vale_transporte: false,
    });
    const titulos = alertas.map((a) => a.titulo);
    expect(titulos).toContain("Redução de salário");
    expect(titulos).toContain("Retirada de benefício");
  });

  it("não alerta quando a mudança é neutra", () => {
    expect(
      alertasAlteracaoContratual(
        { ...clt, possui_folha_ponto: true },
        { ...clt, cargo_id: "c2", salario_base: 2400 },
      ),
    ).toEqual([]);
  });
});
