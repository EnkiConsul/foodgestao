import { describe, expect, it } from "vitest";
import { pendenciasUnidade } from "../unidade-completude";

const completa = {
  cnpj: "12345678000190", cep: "75200-000", logradouro: "Rua A", numero: "10", bairro: "Centro",
  cidade: "Pires do Rio", uf: "GO", telefone: "64999990000", tem_adiantamento: false,
  pagamento_salario_tipo: "quinto_dia_util",
};

describe("cadastro incompleto da unidade", () => {
  it("unidade completa não sinaliza nada", () => {
    expect(pendenciasUnidade(completa, { feriadosAtivos: 9 })).toEqual([]);
  });
  it("aponta as partes do endereço que faltam", () => {
    const p = pendenciasUnidade({ ...completa, numero: "", cep: null });
    expect(p).toEqual([{ chave: "endereco", rotulo: "Endereço", detalhe: "falta número, CEP" }]);
  });
  it("sem dia de pagamento, sem telefone e sem dia do adiantamento", () => {
    const p = pendenciasUnidade({ ...completa, telefone: "", pagamento_salario_tipo: null, tem_adiantamento: true });
    expect(p.map((x) => x.chave)).toEqual(["telefone", "pagamento", "adiantamento"]);
  });
  it("dia fixo sem o dia conta como pagamento em falta", () => {
    expect(pendenciasUnidade({ ...completa, pagamento_salario_tipo: "dia_fixo" }).map((x) => x.chave)).toEqual(["pagamento"]);
  });
  it("unidade sem feriados ativos é sinalizada", () => {
    expect(pendenciasUnidade(completa, { feriadosAtivos: 0 }).map((x) => x.chave)).toEqual(["feriados"]);
  });
});
