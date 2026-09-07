import { describe, it, expect } from "vitest";
import {
  cadastroIncompleto, camposFaltando, camposFaltandoObrigatorios, resumoFaltando,
} from "@/lib/dp/cadastro-completude";

const completo = {
  setor_id: "s1",
  telefone: "62999990000",
  whatsapp: "62999990000",
  email_contato: "a@b.com",
  endereco: { logradouro: "Rua A", texto: "Rua A, 10" },
  data_nascimento: "1990-01-01",
  estado_civil: "solteiro",
  regime: "clt",
  pis_nit: "12345678901",
  salario_base: 1800,
};

describe("cadastro-completude", () => {
  it("não acusa falta quando tudo está preenchido", () => {
    expect(camposFaltando(completo)).toEqual([]);
    expect(cadastroIncompleto(completo)).toBe(false);
  });

  it("aceita só WhatsApp como contato", () => {
    const c = { ...completo, telefone: null };
    expect(camposFaltando(c).map((x) => x.chave)).toEqual([]);
  });

  it("acusa contato quando telefone e WhatsApp estão vazios", () => {
    const c = { ...completo, telefone: "", whatsapp: null };
    expect(camposFaltando(c).map((x) => x.chave)).toEqual(["contato"]);
  });

  it("trata endereço só com objeto vazio como faltante", () => {
    expect(camposFaltando({ ...completo, endereco: { logradouro: null, texto: null } })
      .map((x) => x.chave)).toEqual(["endereco"]);
  });

  it("ignora setor quando a empresa não usa setores", () => {
    const c = { ...completo, setor_id: null };
    expect(camposFaltando(c).map((x) => x.chave)).toEqual(["setor_id"]);
    expect(camposFaltando(c, { exigirSetor: false })).toEqual([]);
  });

  it("considera salário zero como faltante", () => {
    expect(camposFaltando({ ...completo, salario_base: 0 }).map((x) => x.chave)).toEqual([
      "salario_base",
    ]);
  });

  it("resume os faltantes em texto curto", () => {
    const campos = camposFaltando({});
    expect(campos.length).toBe(9);
    expect(resumoFaltando(campos, 2)).toBe("setor e telefone ou WhatsApp e mais 7");
    expect(resumoFaltando([])).toBe("");
  });

  it("só campos obrigatórios marcam o cadastro como incompleto", () => {
    // Falta só opcional (endereço, PIS) → cadastro NÃO é incompleto.
    const soOpcionais = { ...completo, endereco: null, pis_nit: null, email_contato: null };
    expect(camposFaltando(soOpcionais).map((x) => x.chave)).toEqual([
      "email_contato", "endereco", "pis_nit",
    ]);
    expect(cadastroIncompleto(soOpcionais)).toBe(false);
    expect(camposFaltandoObrigatorios(soOpcionais)).toEqual([]);
  });

  it("falta de salário, contato ou vínculo marca como incompleto", () => {
    expect(cadastroIncompleto({ ...completo, salario_base: 0 })).toBe(true);
    expect(cadastroIncompleto({ ...completo, telefone: null, whatsapp: null })).toBe(true);
    expect(cadastroIncompleto({ ...completo, regime: null })).toBe(true);
    // Obrigatórios preenchidos + opcionais vazios → completo para a sinalização.
    expect(cadastroIncompleto({
      telefone: "62999990000", regime: "clt", salario_base: 1800,
    }, { exigirSetor: false })).toBe(false);
  });
});

describe("salário por forma de pagamento e cargo", () => {
  const semSalario = { ...completo, salario_base: null };

  it("horista (intermitente) com valor_hora não acusa falta de salário", () => {
    const c = { ...semSalario, forma_pagamento: "horista", valor_hora: 12.5 };
    expect(camposFaltando(c).map((x) => x.chave)).toEqual([]);
  });

  it("diarista com valor_diaria não acusa falta de salário", () => {
    const c = { ...semSalario, forma_pagamento: "diarista", valor_diaria: 150 };
    expect(camposFaltando(c).map((x) => x.chave)).toEqual([]);
  });

  it("salário vindo do cargo cobre a exigência", () => {
    expect(camposFaltando(semSalario).map((x) => x.chave)).toEqual(["salario_base"]);
    expect(camposFaltando(semSalario, { salarioCargo: 1900 })).toEqual([]);
    expect(cadastroIncompleto(semSalario, { salarioCargo: 1900 })).toBe(false);
  });

  it("sem valor próprio e sem salário do cargo continua incompleto", () => {
    expect(cadastroIncompleto(semSalario, { salarioCargo: null })).toBe(true);
    expect(cadastroIncompleto(semSalario, { salarioCargo: 0 })).toBe(true);
  });

  it("sócio somente lucros não é cobrado de salário", () => {
    const c = { ...semSalario, socio_remuneracao: "somente_lucros" };
    expect(camposFaltando(c)).toEqual([]);
  });
});
