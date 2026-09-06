import { describe, expect, it } from "vitest";
import {
  FILTROS_TROCA_PADRAO,
  contarFiltrosAtivos,
  filtrarTrocas,
  intervaloPeriodo,
  type TrocaFiltravel,
} from "@/lib/dp/trocas-filtros";

const hoje = new Date("2026-09-06T12:00:00Z");

const base = (over: Partial<TrocaFiltravel>): TrocaFiltravel => ({
  status: "pendente_gestor",
  created_at: "2026-09-01T10:00:00Z",
  data_original: "2026-09-10",
  data_proposta: "2026-09-12",
  solicitante: { nome: "Sara Lima", matricula: "001", cargo_id: "c1", unidade_id: "u1" },
  destino: { nome: "Hanna Souza", matricula: "002", cargo_id: "c2", unidade_id: "u1" },
  ...over,
});

const rows = [
  base({}),
  base({
    status: "aprovada",
    created_at: "2026-09-05T10:00:00Z",
    data_original: "2026-10-03",
    data_proposta: "2026-10-05",
    solicitante: { nome: "João Pêra", matricula: "003", cargo_id: "c3", unidade_id: "u2" },
    destino: { nome: "Ana", matricula: "004", cargo_id: "c1", unidade_id: "u2" },
  }),
];

describe("filtrarTrocas", () => {
  it("sem filtros devolve tudo, mais recentes primeiro", () => {
    const r = filtrarTrocas(rows, FILTROS_TROCA_PADRAO, hoje);
    expect(r).toHaveLength(2);
    expect(r[0].created_at).toBe("2026-09-05T10:00:00Z");
  });

  it("busca por nome ignora acentos e caixa", () => {
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, busca: "joao pera" }, hoje)).toHaveLength(1);
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, busca: "HANNA" }, hoje)).toHaveLength(1);
  });

  it("busca por matrícula de qualquer um dos envolvidos", () => {
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, busca: "004" }, hoje)).toHaveLength(1);
  });

  it("filtra por unidade e por cargo de qualquer envolvido", () => {
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, unidadeId: "u2" }, hoje)).toHaveLength(1);
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, cargoId: "c1" }, hoje)).toHaveLength(2);
  });

  it("filtra por situação e pelo atalho de pendentes do gestor", () => {
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, status: "aprovada" }, hoje)).toHaveLength(1);
    expect(filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, pendentesGestor: true }, hoje)).toHaveLength(1);
  });

  it("filtra pelo período das datas envolvidas", () => {
    const atual = filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, periodo: "mes_atual" }, hoje);
    expect(atual).toHaveLength(1);
    expect(atual[0].data_original).toBe("2026-09-10");

    const proximo = filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, periodo: "proximo_mes" }, hoje);
    expect(proximo).toHaveLength(1);
    expect(proximo[0].data_original).toBe("2026-10-03");
  });

  it("período personalizado aceita apenas um dos lados", () => {
    const r = filtrarTrocas(
      { ...FILTROS_TROCA_PADRAO, periodo: "personalizado", de: "2026-10-01", ate: "" }
        ? rows
        : rows,
      { ...FILTROS_TROCA_PADRAO, periodo: "personalizado", de: "2026-10-01", ate: "" },
      hoje,
    );
    expect(r).toHaveLength(1);
  });

  it("ordena pela folga mais próxima", () => {
    const r = filtrarTrocas(rows, { ...FILTROS_TROCA_PADRAO, ordem: "data_folga" }, hoje);
    expect(r[0].data_original).toBe("2026-09-10");
  });
});

describe("intervaloPeriodo e contador", () => {
  it("calcula mês atual e próximo mês", () => {
    expect(intervaloPeriodo({ periodo: "mes_atual", de: "", ate: "" }, hoje)).toEqual({
      de: "2026-09-01",
      ate: "2026-09-30",
    });
    expect(intervaloPeriodo({ periodo: "proximo_mes", de: "", ate: "" }, hoje)).toEqual({
      de: "2026-10-01",
      ate: "2026-10-31",
    });
  });

  it("conta filtros ativos", () => {
    expect(contarFiltrosAtivos(FILTROS_TROCA_PADRAO)).toBe(0);
    expect(
      contarFiltrosAtivos({ ...FILTROS_TROCA_PADRAO, status: "aprovada", unidadeId: "u1" }),
    ).toBe(2);
  });
});
