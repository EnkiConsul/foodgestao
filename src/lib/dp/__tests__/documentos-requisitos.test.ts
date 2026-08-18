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

  it("exige documentos de veículo apenas com veículo próprio", () => {
    const r = req({ aplica_a: "veiculo_proprio" });
    expect(requisitoAplicaColaborador(r, colab())).toBe(false);
    expect(requisitoAplicaColaborador(r, colab({ veiculo_proprio: true }))).toBe(true);
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
  it("soma os meses de validade para periodicidade anual", () => {
    expect(calcularValidade(req({ periodicidade: "anual", meses_validade: 12 }), "2026-01-10")).toBe(
      "2027-01-10",
    );
  });
  it("não calcula validade para documento único", () => {
    expect(calcularValidade(req(), "2026-01-10")).toBeNull();
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

  it("considera o ASO satisfeito pelo módulo de exames", () => {
    const itens = resolverChecklist({
      requisitos: [req({ codigo: "aso", satisfeito_por: "aso" })],
      colaborador: colab(),
      dependentes: [],
      vinculos: [],
      asoAdmissionalOk: true,
    });
    expect(itens[0].status).toBe("aprovado");
    expect(itens[0].externo).toBe(true);
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
