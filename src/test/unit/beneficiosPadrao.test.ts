import { describe, expect, it } from "vitest";
import {
  assinaturaPadrao,
  diferencasPadrao,
  nivelPadrao,
  padroesIguais,
  padroesIguaisAlgum,
  resolverPadrao,
  type BeneficiosPadraoPayload,
  padraoParaColunasColaborador,
} from "@/lib/dp/beneficiosPadrao";


const base = {
  vale_transporte: true,
  vale_transporte_valor_dia: "12,00",
  vale_alimentacao: true,
  vale_alimentacao_valor: "24",
  beneficios: { plano_saude: true, seguro: false },
} as unknown as BeneficiosPadraoPayload;

describe("padrão de benefícios", () => {
  it("ignora ordem de chaves e formato numérico na comparação", () => {
    const doBanco = {
      beneficios: { seguro: false, plano_saude: true },
      vale_alimentacao_valor: "24,00",
      vale_alimentacao: true,
      vale_transporte_valor_dia: "12",
      vale_transporte: true,
    } as unknown as BeneficiosPadraoPayload;
    expect(padroesIguais(base, doBanco)).toBe(true);
    expect(assinaturaPadrao(base)).toBe(assinaturaPadrao(doBanco));
  });

  it("detecta diferença real", () => {
    const outro = { ...base, vale_alimentacao_valor: "30" } as BeneficiosPadraoPayload;
    expect(padroesIguais(base, outro)).toBe(false);
  });

  it("resolve na precedência cargo → unidade → empresa", () => {
    const linhas = [
      { unidade_id: null, cargo_id: null, payload: {} as BeneficiosPadraoPayload },
      { unidade_id: "u1", cargo_id: null, payload: {} as BeneficiosPadraoPayload },
      { unidade_id: "u1", cargo_id: "c1", payload: {} as BeneficiosPadraoPayload },
    ];
    expect(nivelPadrao(resolverPadrao(linhas, "u1", "c1"))).toBe("cargo");
    expect(nivelPadrao(resolverPadrao(linhas, "u1", "c9"))).toBe("unidade");
    expect(nivelPadrao(resolverPadrao(linhas, "u9", "c1"))).toBe("empresa");
  });

  it("não pergunta quando bate com o padrão da empresa, mesmo com padrão de unidade diferente", () => {
    const daEmpresa = { ...base, assiduidade_max_atrasos: "3" } as BeneficiosPadraoPayload;
    const daUnidade = { ...base, assiduidade_max_atrasos: "5" } as BeneficiosPadraoPayload;
    const linhas = [
      { unidade_id: null, cargo_id: null, payload: daEmpresa },
      { unidade_id: "u1", cargo_id: null, payload: daUnidade },
    ];
    expect(padroesIguaisAlgum(daEmpresa, linhas, { unidadeId: "u1" })).toBe(true);
    expect(
      padroesIguaisAlgum({ ...base, assiduidade_max_atrasos: "9" } as BeneficiosPadraoPayload, linhas, {
        unidadeId: "u1",
      }),
    ).toBe(false);
  });

  it("trata booleano ausente em padrão antigo como não informado", () => {
    const antigo = { ...base } as BeneficiosPadraoPayload;
    const novo = { ...base, assiduidade_considera_atestado: false } as BeneficiosPadraoPayload;
    expect(padroesIguais(antigo, novo)).toBe(true);
    expect(diferencasPadrao(antigo, novo)).toHaveLength(0);
  });

  it("lista as diferenças com rótulo em português", () => {
    const outro = { ...base, vale_alimentacao_valor: "30" } as BeneficiosPadraoPayload;
    const difs = diferencasPadrao(outro, base);
    expect(difs).toHaveLength(1);
    expect(difs[0].rotulo).toBe("Valor do vale-alimentação");
    expect(difs[0].atual).toBe("30");
  });
});


describe("padraoParaColunasColaborador", () => {
  it("converte números BR e respeita as travas de coerência", () => {
    const cols = padraoParaColunasColaborador({
      premio_assiduidade: true,
      premio_assiduidade_valor: "11",
      premio_assiduidade_tipo: "percentual",
      assiduidade_criterio: "sem_faltas",
      assiduidade_tolerancia_min: "10",
      assiduidade_max_atrasos: "3",
      assiduidade_considera_atestado: true,
      assiduidade_max_atestados: "0",
      vale_alimentacao: true,
      vale_alimentacao_valor: "24,50",
      vale_alimentacao_periodicidade: "diario",
      vale_alimentacao_dias_base: "22",
      vale_alimentacao_dias_origem: "jornada",
      vale_alimentacao_desconto_tipo: "nenhum",
      vale_alimentacao_desconto_valor: "5",
      vale_transporte: false,
      vale_transporte_valor_dia: "9",
      beneficios: {},
    } as never);
    expect(cols.assiduidade_max_atrasos).toBe(3);
    expect(cols.vale_alimentacao_valor).toBe(24.5);
    expect(cols.vale_alimentacao_desconto_valor).toBe(0);
    expect(cols.vale_transporte_valor_dia).toBeNull();
    expect(cols).not.toHaveProperty("beneficios");
  });

  it("zera critérios de assiduidade quando o prêmio está desligado", () => {
    const cols = padraoParaColunasColaborador({
      premio_assiduidade: false,
      assiduidade_max_atrasos: "5",
      assiduidade_criterio: "sem_faltas",
    } as never);
    expect(cols.assiduidade_max_atrasos).toBeNull();
    expect(cols.assiduidade_criterio).toBeNull();
    expect(cols.premio_assiduidade_tipo).toBe("valor");
  });
});
