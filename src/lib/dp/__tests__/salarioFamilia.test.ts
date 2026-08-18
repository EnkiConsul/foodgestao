import { describe, it, expect } from "vitest";
import {
  alertasDependentes,
  calcularSalarioFamilia,
  dependenteElegivel,
  idadeEm,
  tabelaSalarioFamiliaVencida,
  type Dependente,
} from "../salarioFamilia";

const dep = (over: Partial<Dependente> = {}): Dependente => ({
  id: over.id ?? "d1",
  colaborador_id: "c1",
  nome: "Filho",
  data_nascimento: "2015-01-01",
  parentesco: "filho",
  cpf: null,
  deficiencia: false,
  laudo_validade: null,
  conta_irrf: true,
  conta_salario_familia: true,
  vacinacao_em: null,
  frequencia_escolar_em: null,
  cessado_em: null,
  observacao: null,
  ...over,
});

const config = { cota: 65, teto: 1900, vigencia: "2026-01-01", confirmadoEm: "2026-01-05" };

describe("idade e elegibilidade", () => {
  it("calcula idade em anos completos", () => {
    expect(idadeEm("2015-06-01", "2026-05-31")).toBe(10);
    expect(idadeEm("2015-06-01", "2026-06-01")).toBe(11);
  });

  it("dependente de 14 anos deixa de ser elegível", () => {
    expect(dependenteElegivel(dep({ data_nascimento: "2012-01-01" }), "2026-01-02")).toBe(false);
    expect(dependenteElegivel(dep({ data_nascimento: "2013-01-01" }), "2026-01-02")).toBe(true);
  });

  it("deficiência mantém a cota em qualquer idade", () => {
    expect(
      dependenteElegivel(dep({ data_nascimento: "1990-01-01", deficiencia: true }), "2026-01-02"),
    ).toBe(true);
  });
});

describe("calcularSalarioFamilia", () => {
  it("multiplica a cota pelos dependentes elegíveis", () => {
    const r = calcularSalarioFamilia({
      dependentes: [dep(), dep({ id: "d2" })],
      remuneracaoMensal: 1750,
      config,
      referencia: "2026-08-18",
    });
    expect(r.quantidade).toBe(2);
    expect(r.valor).toBe(130);
  });

  it("zera acima do teto de baixa renda", () => {
    const r = calcularSalarioFamilia({
      dependentes: [dep()],
      remuneracaoMensal: 5000,
      config,
      referencia: "2026-08-18",
    });
    expect(r.valor).toBe(0);
    expect(r.dentroDoTeto).toBe(false);
  });

  it("sinaliza tabela não configurada", () => {
    const r = calcularSalarioFamilia({
      dependentes: [dep()],
      remuneracaoMensal: 1000,
      config: { cota: null, teto: null, vigencia: null, confirmadoEm: null },
      referencia: "2026-08-18",
    });
    expect(r.tabelaPendente).toBe(true);
  });
});

describe("alertas e vigência", () => {
  it("cobra vacinação anual e frequência escolar semestral", () => {
    const tipos = alertasDependentes(
      [
        dep({ id: "pequeno", data_nascimento: "2021-01-01" }),
        dep({ id: "escolar", data_nascimento: "2016-01-01" }),
      ],
      "2026-08-18",
    ).map((a) => a.tipo);
    expect(tipos).toContain("vacinacao");
    expect(tipos).toContain("frequencia_escolar");
  });

  it("tabela de ano anterior está vencida", () => {
    expect(tabelaSalarioFamiliaVencida(config, "2027-01-10")).toBe(true);
    expect(tabelaSalarioFamiliaVencida(config, "2026-08-18")).toBe(false);
  });
});
