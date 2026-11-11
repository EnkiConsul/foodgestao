import { describe, expect, it } from "vitest";
import { planejarFichaLote, planejarLote, type ContextoEfetivacao } from "../efetivacao-lote";
import type { OrganizacaoLote } from "../organizacao-lote";

const ficha = (id: string, extra: Record<string, unknown> = {}, status = "pendente", existente: string | null = null) => ({
  id, status, nome_extraido: `Pessoa ${id}`, cpf_extraido: "12345678909", colaborador_existente_id: existente,
  dados_extraidos: {
    nome: `Pessoa ${id}`, cpf: "12345678909", telefone: "64999990000", cargo_nome: "COZINHEIRA", cbo: "513205",
    pis_nit: "12345678901", salario: 1600, salario_periodo: "mensal", ...extra,
  },
});

const ctx: ContextoEfetivacao = {
  unidadeId: "u1",
  unidades: [{ id: "u1", nome: "Rancho" }],
  cargos: [{ id: "c1", nome: "COZINHEIRA" }],
  turnos: [],
  padroes: { regime: null, adiantamento: false, unidadeTemPonto: true },
  exigirSetor: false,
};

const org = (ajustes: OrganizacaoLote["ajustes"] = {}): OrganizacaoLote => ({
  unidade_id: "u1",
  grupos: { "COZINHEIRA|513205": { cargo_id: "c1", setor_id: "s1" } },
  ajustes,
});

describe("finalizar implantação do lote", () => {
  it("ficha pronta entra com cargo e setor do lote, ponto da unidade e não optante de adiantamento", () => {
    const p = planejarFichaLote(ficha("a"), org(), ctx);
    expect(p.apta).toBe(true);
    if (!p.apta) return;
    expect(p.envio.cargoId).toBe("c1");
    expect(p.envio.setorId).toBe("s1");
    expect(p.envio.unidadeId).toBe("u1");
    expect(p.envio.possuiFolhaPonto).toBe(true);
    expect(p.envio.optanteAdiantamento).toBe(false);
    expect(p.envio.regime).toBe("clt");
    expect(p.envio.formaPagamento).toBe("mensalista");
  });

  it("salário corrigido no lote vale no cadastro e aparece como diferença da ficha", () => {
    const p = planejarFichaLote(ficha("a"), org({ a: { dados: { salario: "1710" } } }), ctx);
    expect(p.apta).toBe(true);
    if (!p.apta) return;
    expect(p.envio.dados.salario).toBe("1710");
    expect(p.divergencias.map((d) => d.campo)).toEqual(["salario"]);
  });

  it("quem não tem telefone nem e-mail também é cadastrado", () => {
    const p = planejarFichaLote(ficha("a", { telefone: null }), org(), ctx);
    expect(p.apta).toBe(true);
    if (p.apta) expect(p.semAcesso).toBe(true);
  });

  it("quem foi marcado como não registra ponto entra sem ponto e com o motivo", () => {
    const p = planejarFichaLote(
      ficha("a"),
      org({ a: { folha_ponto: false, folha_ponto_justificativa: "Cargo de confiança, Art. 62 II" } }),
      ctx,
    );
    expect(p.apta).toBe(true);
    if (!p.apta) return;
    expect(p.envio.possuiFolhaPonto).toBe(false);
    expect(p.envio.dados.folha_ponto_dispensa_justificativa).toBe("Cargo de confiança, Art. 62 II");
  });

  it("ficha sem cargo definido fica para conferir com o motivo", () => {
    const p = planejarFichaLote(ficha("a", { cargo_nome: "Importação eSocial" }), org(), ctx);
    expect(p.apta).toBe(false);
    if (!p.apta) expect(p.motivos).toContain("cargo");
  });

  it("CPF que já tem cadastro nunca é criado em lote", () => {
    const p = planejarFichaLote(ficha("a", {}, "pendente", "colab-1"), org(), ctx);
    expect(p.apta).toBe(false);
  });

  it("fichas ignoradas e já cadastradas não entram na contagem", () => {
    const r = planejarLote([ficha("a"), ficha("b", {}, "ignorado"), ficha("c", {}, "criado")], org(), ctx);
    expect(r.aptas.map((p) => p.itemId)).toEqual(["a"]);
    expect(r.foraDoLote).toHaveLength(0);
  });
});
