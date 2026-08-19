import { describe, expect, it } from "vitest";
import {
  calcularValidade,
  requisitoAplicaColaborador,
  requisitoAplicaDependente,
  resolverChecklist,
  resumirChecklist,
} from "../documentos-requisitos";

const req = (over: Partial<any> = {}): any => ({
  id: over.id ?? "r1",
  company_id: "c1",
  codigo: over.codigo ?? "identidade",
  nome: over.nome ?? "Documento de identidade",
  descricao: null,
  categoria: over.categoria ?? "admissao",
  obrigatoriedade: over.obrigatoriedade ?? "obrigatorio",
  aplica_a: over.aplica_a ?? "todos",
  tipo_documento: over.tipo_documento ?? "admissao",
  periodicidade: over.periodicidade ?? "unica",
  meses_validade: over.meses_validade ?? null,
  dias_aviso: over.dias_aviso ?? 30,
  gerado_pelo_sistema: over.gerado_pelo_sistema ?? false,
  exige_aceite: over.exige_aceite ?? false,
  satisfeito_por: over.satisfeito_por ?? null,
  sistema: true,
  ordem: 100,
  created_at: "",
  updated_at: "",
});

const colab = (over: Partial<any> = {}): any => ({
  id: "col1",
  data_nascimento: "1990-05-10",
  regime: "clt",
  estado_civil: "solteiro",
  veiculo_proprio: false,
  aprendiz: false,
  possui_folha_ponto: true,
  cargo_exige_cnh: false,
  cargo_exige_epi: false,
  ...over,
});

describe("requisitoAplicaColaborador", () => {
  it("exige CNH apenas quando o cargo dirige", () => {
    const r = req({ aplica_a: "cargo_dirige" });
    expect(requisitoAplicaColaborador(r, colab())).toBe(false);
    expect(requisitoAplicaColaborador(r, colab({ cargo_exige_cnh: true }))).toBe(true);
  });

  it("exige documentos de veículo só para quem dirige com veículo próprio", () => {
    const r = req({ aplica_a: "veiculo_proprio" });
    expect(requisitoAplicaColaborador(r, colab({ veiculo_proprio: true }))).toBe(false);
    expect(
      requisitoAplicaColaborador(r, colab({ cargo_exige_cnh: true, veiculo_proprio: true })),
    ).toBe(true);
    expect(
      requisitoAplicaColaborador(req({ aplica_a: "veiculo_empresa" }), colab({ cargo_exige_cnh: true })),
    ).toBe(true);
  });

  it("trata menor de 18 e aprendiz", () => {
    const r = req({ aplica_a: "menor" });
    const ano = new Date().getFullYear();
    expect(requisitoAplicaColaborador(r, colab({ data_nascimento: `${ano - 16}-01-01` }))).toBe(true);
    expect(requisitoAplicaColaborador(r, colab())).toBe(false);
    expect(requisitoAplicaColaborador(r, colab({ aprendiz: true }))).toBe(true);
  });
});

describe("requisitoAplicaDependente", () => {
  const ano = new Date().getFullYear();
  it("separa faixas de idade e invalidez", () => {
    const bebe: any = { id: "d1", nome: "Bebê", data_nascimento: `${ano - 3}-01-01`, deficiencia: false };
    const jovem: any = { id: "d2", nome: "Jovem", data_nascimento: `${ano - 12}-01-01`, deficiencia: false };
    expect(requisitoAplicaDependente(req({ aplica_a: "dependente_ate_7" }), bebe)).toBe(true);
    expect(requisitoAplicaDependente(req({ aplica_a: "dependente_ate_7" }), jovem)).toBe(false);
    expect(requisitoAplicaDependente(req({ aplica_a: "dependente_acima_7" }), jovem)).toBe(true);
    expect(requisitoAplicaDependente(req({ aplica_a: "dependente_invalido" }), jovem)).toBe(false);
  });
});

describe("calcularValidade", () => {
  const vinculo = (over: Partial<any> = {}): any => ({
    id: "v1",
    requisito_id: "r1",
    colaborador_id: "col1",
    dependente_id: null,
    documento_id: "doc1",
    status: "aprovado",
    validade: null,
    dispensado: false,
    created_at: "2026-01-10T12:00:00Z",
    ...over,
  });

  it("soma os meses de validade para periodicidade anual", () => {
    expect(
      calcularValidade(req({ periodicidade: "anual", meses_validade: 12 }), vinculo()),
    ).toBe("2027-01-10");
  });
  it("prioriza a validade informada manualmente", () => {
    expect(calcularValidade(req(), vinculo({ validade: "2026-12-31" }))).toBe("2026-12-31");
  });
  it("não calcula validade para documento único", () => {
    expect(calcularValidade(req(), vinculo())).toBeNull();
  });
});

describe("resolverChecklist", () => {
  it("marca obrigatório sem envio como pendente", () => {
    const itens = resolverChecklist({
      requisitos: [req()],
      colaborador: colab(),
      dependentes: [],
      vinculos: [],
    });
    expect(itens).toHaveLength(1);
    expect(itens[0].status).toBe("pendente");
    expect(resumirChecklist(itens).pendentesObrigatorios).toHaveLength(1);
  });

  it("agrega vários anexos no mesmo item e prioriza o aprovado", () => {
    const itens = resolverChecklist({
      requisitos: [req({ codigo: "contrato", permite_multiplos: true })],
      colaborador: colab(),
      dependentes: [],
      vinculos: [
        { id: "v1", requisito_id: "r1", colaborador_id: "col1", dependente_id: null, documento_id: "d1", status: "enviado", dispensado: false } as any,
        { id: "v2", requisito_id: "r1", colaborador_id: "col1", dependente_id: null, documento_id: "d2", status: "aprovado", dispensado: false } as any,
      ],
    });
    expect(itens).toHaveLength(1);
    expect(itens[0].anexos).toHaveLength(2);
    expect(itens[0].status).toBe("aprovado");
    expect(itens[0].multiplos).toBe(true);
  });


  it("marca documento com validade expirada como vencido", () => {
    const itens = resolverChecklist({
      requisitos: [req({ periodicidade: "anual", meses_validade: 12 })],
      colaborador: colab(),
      dependentes: [],
      vinculos: [
        {
          id: "v1",
          requisito_id: "r1",
          colaborador_id: "col1",
          dependente_id: null,
          documento_id: "doc1",
          status: "aprovado",
          validade: "2020-01-01",
          dispensado: false,
        } as any,
      ],
    });
    expect(itens[0].status).toBe("vencido");
  });

  it("ignora requisitos desativados e expande dependentes", () => {
    const ano = new Date().getFullYear();
    const itens = resolverChecklist({
      requisitos: [
        req({ id: "r1", obrigatoriedade: "desativado" }),
        req({ id: "r2", categoria: "dependente", aplica_a: "dependente" }),
      ],
      colaborador: colab(),
      dependentes: [
        { id: "d1", nome: "Filho", data_nascimento: `${ano - 4}-01-01`, deficiencia: false } as any,
        { id: "d2", nome: "Filha", data_nascimento: `${ano - 9}-01-01`, deficiencia: false } as any,
      ],
      vinculos: [],
    });
    expect(itens).toHaveLength(2);
    expect(itens.every((i) => i.requisito.id === "r2")).toBe(true);
    expect(itens.map((i) => i.dependente?.nome)).toEqual(["Filho", "Filha"]);
  });
});
