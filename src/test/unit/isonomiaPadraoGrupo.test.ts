import { describe, it, expect } from "vitest";
import {
  descreverPadraoGrupo, divergenciasIsonomia, type ColegaIsonomia,
} from "@/lib/dp/beneficios-regras";

/** Colega com vale-alimentação diário de R$ 24,00 (base 22 dias = R$ 528/mês). */
function colegaDiario(id: string): ColegaIsonomia {
  return {
    colaborador_id: id,
    nome: `Colega ${id}`,
    sindicato_id: "sind-1",
    patronal_id: "patr-1",
    unidade_id: "u1",
    cargo_id: "c1",
    beneficios: {
      vale_alimentacao: {
        ativo: true,
        valorMes: 528,
        valorUnitario: 24,
        periodicidade: "diario",
      },
    },
  };
}

const alvo = { sindicato_id: "sind-1", patronal_id: "patr-1", unidade_id: "u1", cargo_id: "c1" };

describe("isonomia — padrão do grupo na periodicidade cadastrada", () => {
  it("reporta o padrão diário sem projetar dias no mês", () => {
    const [d] = divergenciasIsonomia(
      [{ chave: "vale_alimentacao", nome: "Vale-alimentação", ativo: false, compararValor: true }],
      [colegaDiario("a"), colegaDiario("b")],
      alvo,
      { sindicatoNome: "SECHSEG" },
    );

    expect(d.tipo).toBe("ausente");
    expect(d.padrao_unitario).toBe(24);
    expect(d.padrao_periodicidade).toBe("diario");
    expect(descreverPadraoGrupo(d)).toBe("R$ 24,00/dia");
    expect(descreverPadraoGrupo(d)).not.toContain("mês");
  });

  it("compara valor diário contra diário, sem equivalente mensal no texto", () => {
    const [d] = divergenciasIsonomia(
      [{
        chave: "vale_alimentacao", nome: "Vale-alimentação", ativo: true,
        valorMes: 22 * 22, valorUnitario: 22, periodicidade: "diario", compararValor: true,
      }],
      [colegaDiario("a"), colegaDiario("b")],
      alvo,
    );

    expect(d.tipo).toBe("valor_menor");
    expect(d.atual_unitario).toBe(22);
    expect(d.mensagem).toContain("R$ 24,00/dia");
    expect(d.mensagem).toContain("R$ 22,00/dia");
  });

  it("cai para o equivalente mensal quando as periodicidades diferem", () => {
    const [d] = divergenciasIsonomia(
      [{
        chave: "vale_alimentacao", nome: "Vale-alimentação", ativo: true,
        valorMes: 400, valorUnitario: 400, periodicidade: "mensal", compararValor: true,
      }],
      [colegaDiario("a"), colegaDiario("b")],
      alvo,
    );

    expect(d.tipo).toBe("valor_menor");
    expect(d.mensagem).toContain("estimativa");
    // O padrão exibido continua sendo o diário cadastrado pelo grupo.
    expect(descreverPadraoGrupo(d)).toBe("R$ 24,00/dia");
  });

  it("sem periodicidade conhecida no grupo, exibe o valor mensal", () => {
    const colega: ColegaIsonomia = {
      colaborador_id: "x", nome: "Colega X", sindicato_id: "sind-1", unidade_id: "u1", cargo_id: "c1",
      beneficios: { plano: { ativo: true, valorMes: 300 } },
    };
    const [d] = divergenciasIsonomia(
      [{ chave: "plano", nome: "Plano de saúde", ativo: false }],
      [colega],
      alvo,
    );
    expect(descreverPadraoGrupo(d)).toBe("R$ 300,00/mês");
  });
});
