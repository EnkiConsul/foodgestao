import { describe, expect, it } from "vitest";
import { planejarFichaLote, type ContextoEfetivacao } from "../efetivacao-lote";
import { ajustesEmGrupo, pendenciasFichaLote, situacaoPorPendencias, type OrganizacaoLote } from "../organizacao-lote";

const ficha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, status: "pendente", nome_extraido: `Pessoa ${id}`, cpf_extraido: "12345678909", colaborador_existente_id: null,
  dados_extraidos: {
    nome: `Pessoa ${id}`, cpf: "12345678909", telefone: "64999990000", cargo_nome: "COZINHEIRA", cbo: "513205",
    pis_nit: "12345678901", salario: 1600, salario_periodo: "mensal", ...extra,
  },
});
const ctx: ContextoEfetivacao = {
  unidadeId: "u1", unidades: [{ id: "u1", nome: "Rancho" }], cargos: [{ id: "c1", nome: "COZINHEIRA" }],
  turnos: [], padroes: { regime: null, adiantamento: false, unidadeTemPonto: true }, exigirSetor: false,
};
const org = (ajustes: OrganizacaoLote["ajustes"] = {}): OrganizacaoLote => ({
  unidade_id: "u1", grupos: { "COZINHEIRA|513205": { cargo_id: "c1", setor_id: "s1" } }, ajustes,
});

describe("assinatura em papel na importação de fichas", () => {
  it("sem contato e sem marcar papel fica como 'Dados de acesso'", () => {
    const p = pendenciasFichaLote(ficha("a", { telefone: null }) as never, org(), { padroes: ctx.padroes, exigirSetor: false, formaPagamento: "mensalista" });
    expect(situacaoPorPendencias(p)).toBe("acesso");
  });

  it("sem contato e marcada para assinar em papel fica pronta", () => {
    const p = pendenciasFichaLote(ficha("a", { telefone: null }) as never, org({ a: { assinatura_papel: true } }), {
      padroes: ctx.padroes, exigirSetor: false, formaPagamento: "mensalista",
    });
    expect(situacaoPorPendencias(p)).toBe("pronta");
  });

  it("a finalização leva 'assina em papel' só para quem foi marcado", () => {
    const marcada = planejarFichaLote(ficha("a"), org({ a: { assinatura_papel: true } }), ctx);
    const outra = planejarFichaLote(ficha("b"), org({ a: { assinatura_papel: true } }), ctx);
    expect(marcada.apta && marcada.envio.assinaturaPapel).toBe(true);
    expect(outra.apta && outra.envio.assinaturaPapel).toBe(false);
  });

  it("a ação em grupo aplica papel só às fichas escolhidas", () => {
    const { itens } = ajustesEmGrupo(["a", "b"], { assinatura_papel: true }, () => false);
    expect(itens).toEqual({ a: { assinatura_papel: true }, b: { assinatura_papel: true } });
  });
});
