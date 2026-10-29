import { describe, expect, it } from "vitest";
import { marcosRescisao, rescisoesPeriodo, type ProcessoCalendario } from "../rescisao-calendario";

const processo: ProcessoCalendario = { id: "ficticio", status: "aviso_em_curso", ultimo_comparecimento: "2026-10-23", data_efetiva: "2026-11-06", prazo_10_dias: "2026-11-16", colaborador: { nome: "Pessoa fictícia", unidade_id: "unidade-a" } };
describe("Rescisão no calendário", () => {
  it("inclui outubro pelo último dia mesmo com término e pagamento em novembro", () => {
    expect(rescisoesPeriodo([processo], "2026-10", "unidade-a")).toEqual([processo]);
  });
  it("inclui novembro pelo término e pagamento", () => {
    expect(rescisoesPeriodo([processo], "2026-11", "unidade-a")).toEqual([processo]);
  });
  it.each(["2026-10-23", "2026-11-06", "2026-11-16"])("mostra o processo no detalhe de %s", (dia) => {
    expect(rescisoesPeriodo([processo], dia)).toEqual([processo]);
  });
  it("não inventa último comparecimento a partir do término", () => {
    expect(marcosRescisao({ ...processo, ultimo_comparecimento: null }).map((m) => m.tipo)).toEqual(["termino", "pagamento"]);
  });
  it("mantém marcos coincidentes e conta o processo uma única vez", () => {
    const p = { ...processo, ultimo_comparecimento: processo.data_efetiva };
    expect(marcosRescisao(p).filter((m) => m.data === "2026-11-06").map((m) => m.tipo)).toEqual(["ultimo_dia", "termino"]);
    expect(rescisoesPeriodo([p], "2026-11")).toHaveLength(1);
  });
  it("não mistura unidades", () => {
    expect(rescisoesPeriodo([processo], "2026-10", "unidade-b")).toEqual([]);
  });
  it("não exibe processo cancelado", () => {
    expect(rescisoesPeriodo([{ ...processo, status: "cancelado" }], "2026-10")).toEqual([]);
  });
  it("mantém processos efetivados visíveis após saída da escala", () => {
    expect(rescisoesPeriodo([{ ...processo, status: "efetivado" }], "2026-11")).toHaveLength(1);
  });
  it("não inclui meses sem nenhum marco", () => {
    expect(rescisoesPeriodo([processo], "2026-12")).toEqual([]);
  });
});