import { describe, it, expect } from "vitest";
import { extrairCpfValido, extrairNomePessoa, isCpfValido } from "@/lib/dp/doc-pessoa";
import * as shared from "../../../supabase/functions/_shared/doc-pessoa.ts";

const FOLHA_COM_PIS = `
EMPRESA PAKERE ALIMENTOS LTDA
CNPJ: 12.345.678/0001-95
NOME DO FUNCIONARIO: JOSE DA SILVA SANTOS
PIS/NIT: 12345678901
CPF: 529.982.247-25
COMPETENCIA: 07/2026
`;

const FOLHA_SEM_CPF = `
FOLHA DE PAGAMENTO
FUNCIONARIO: MARIA DAS DORES OLIVEIRA
MATRICULA INSS: 12345678901
COMPETENCIA: 07/2026
`;

const FOLHA_ROTULO_ABAIXO = `
PAKERE COMERCIO DE ALIMENTOS LTDA
CNPJ: 12.345.678/0001-95
Nome do Funcionario
ANA PAULA FERREIRA COSTA
Cargo: SOCIO
COMPETENCIA: 07/2026
`;

describe("extração da pessoa do documento", () => {
  it("ignora PIS/NIT e usa o CPF rotulado", () => {
    expect(extrairCpfValido(FOLHA_COM_PIS)).toBe("52998224725");
  });

  it("não sugere CPF quando o documento não informa", () => {
    expect(extrairCpfValido(FOLHA_SEM_CPF)).toBeNull();
  });

  it("usa a linha PESSOA quando disponível", () => {
    expect(extrairNomePessoa("PESSOA: Tamires de Souza Lima\nCPF_PESSOA: DESCONHECIDO"))
      .toBe("Tamires de Souza Lima");
  });

  it("lê o nome pelo rótulo da folha", () => {
    expect(extrairNomePessoa(FOLHA_COM_PIS)).toBe("JOSE DA SILVA SANTOS");
    expect(extrairNomePessoa(FOLHA_SEM_CPF)).toBe("MARIA DAS DORES OLIVEIRA");
  });

  it("lê o nome na linha abaixo do rótulo isolado", () => {
    expect(extrairNomePessoa(FOLHA_ROTULO_ABAIXO)).toBe("ANA PAULA FERREIRA COSTA");
  });

  it("nunca usa a razão social do cabeçalho", () => {
    expect(extrairNomePessoa(`PAKERE COMERCIO DE ALIMENTOS LTDA\nCNPJ: 12.345.678/0001-95\nNome: PAKERE COMERCIO DE ALIMENTOS LTDA\nCOMPETENCIA: 07/2026`))
      .toBeNull();
  });

  it("rejeita PESSOA com razão social e cai para o rótulo do funcionário", () => {
    expect(extrairNomePessoa(`PESSOA: PAKERE ALIMENTOS LTDA\n${FOLHA_ROTULO_ABAIXO}`))
      .toBe("ANA PAULA FERREIRA COSTA");
  });

  it("valida dígitos verificadores", () => {
    expect(isCpfValido("529.982.247-25")).toBe(true);
    expect(isCpfValido("12345678901")).toBe(false);
    expect(isCpfValido("11111111111")).toBe(false);
  });

  it("mantém paridade com o módulo usado na leitura do documento", () => {
    for (const texto of [FOLHA_COM_PIS, FOLHA_SEM_CPF, "PESSOA: DESCONHECIDO", ""]) {
      expect(shared.extrairCpfValido(texto)).toBe(extrairCpfValido(texto));
      expect(shared.extrairNomePessoa(texto)).toBe(extrairNomePessoa(texto));
    }
  });
});
