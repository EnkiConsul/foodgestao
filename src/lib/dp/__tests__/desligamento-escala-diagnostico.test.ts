import { describe, expect, it } from "vitest";
import { simularDesligamento } from "../compensacao/desligamentoMotor";
import { diagnosticarEscalaAviso, concentrarBancoNoFinal, type RegraDescansoAviso } from "../desligamento-escala-diagnostico";
import { ultimoDiaNaEscala } from "../operacao-panorama";

// Pakerê: 1 folga por mês em sábado ou domingo (acordo coletivo).
const pakere: RegraDescansoAviso = { origem: "unidade", modo: "por_mes", semanas: 0, porMes: 1, dias: [0, 6] };
const domingo: RegraDescansoAviso = { origem: "unidade", modo: "por_mes", semanas: 0, porMes: 1, dias: [0] };
// Folga fixa na terça; trabalha nos demais dias, 7h20.
const JORNADA: [number, number, number, number, number, number, number] = [440, 440, 0, 440, 440, 440, 440];

function rosangela(opts: { folgas?: string[]; reducao?: "sete_dias" | "duas_horas"; motivo?: "dispensa_sem_justa_causa" | "pedido_demissao" } = {}) {
  const r = simularDesligamento({ dataAdmissao: "2026-01-05", dataComunicacao: "2026-10-07", modalidade: "trabalhado",
    motivo: opts.motivo ?? "dispensa_sem_justa_causa", reducao: opts.motivo === "pedido_demissao" ? null : opts.reducao ?? "sete_dias",
    jornadaSemanal: JORNADA, excecoesJornada: (opts.folgas ?? []).map((data) => ({ data, minutos: 0 })) });
  if ("erro" in r) throw new Error(r.erro);
  return r;
}

describe("Folga dominical no desligamento (mês civil)", () => {
  it("folga de fim de semana tirada no começo do mês (antes do aviso) cumpre outubro", () => {
    const d = diagnosticarEscalaAviso(rosangela(), pakere, [], undefined, ["2026-10-04"]);
    expect(d.apto).toBe(true);
  });
  it("mês sem trabalho (novembro, coberto pelos 7 dias) não exige folga e folga marcada lá não é pendência", () => {
    const d = diagnosticarEscalaAviso(rosangela(), pakere, ["2026-11-01"], undefined, ["2026-10-04"]);
    expect(d.mesesIsentos).toContain("2026-11");
    expect(d.apto).toBe(true);
  });
  it("sem folga no mês e com fim de semana trabalhado antes do limite: bloqueia com a data limite", () => {
    const b = rosangela();
    const d = diagnosticarEscalaAviso(b, pakere, [], undefined, []);
    expect(d.apto).toBe(false);
    expect(d.pendencias[0]).toBe(`É necessário remarcar a folga dominical para antes de ${b.ultimoComparecimento!.split("-").reverse().join("/")}.`);
  });
  it("sábado conta na regra da Pakerê, mas não na regra só de domingo", () => {
    const b = rosangela({ folgas: ["2026-10-17"] });
    expect(diagnosticarEscalaAviso(b, pakere, [], undefined, []).apto).toBe(true);
    expect(diagnosticarEscalaAviso(b, domingo, [], undefined, []).apto).toBe(false);
  });
  it("não audita folga semanal nem dias seguidos no desligamento", () => {
    const semFolgaSemanal = simularDesligamento({ dataAdmissao: "2026-01-05", dataComunicacao: "2026-10-07", modalidade: "trabalhado",
      motivo: "dispensa_sem_justa_causa", reducao: "sete_dias", jornadaSemanal: [440, 440, 440, 440, 440, 440, 440] });
    if ("erro" in semFolgaSemanal) throw new Error(semFolgaSemanal.erro);
    expect(diagnosticarEscalaAviso(semFolgaSemanal, pakere, [], undefined, ["2026-10-04"]).apto).toBe(true);
  });
});

describe("Banco de horas agrupado no final", () => {
  it("só consome dias de trabalho, nunca a folga fixa nem os 7 dias da redução", () => {
    const b = rosangela();
    const datas = concentrarBancoNoFinal(b, 20 * 60);
    expect(datas).toHaveLength(2); // 2 × 7h20 = 14h40; sobram 5h20
    for (const d of datas) expect(b.calendario.find((c) => c.data === d)?.classificacao).toBe("trabalho_previsto");
    expect(datas.every((d) => d <= b.ultimoComparecimento!)).toBe(true);
  });
  it("saldo menor que um dia de trabalho não compensa nada", () => {
    expect(concentrarBancoNoFinal(rosangela(), 3 * 60)).toEqual([]);
  });
  it("redução de 2h por dia: cada dia consome a jornada reduzida (5h20)", () => {
    const b = rosangela({ reducao: "duas_horas" });
    expect(concentrarBancoNoFinal(b, 16 * 60)).toHaveLength(3);
  });
  it("pedido de demissão não tem redução legal: agrupa a partir do último dia do aviso", () => {
    const b = rosangela({ motivo: "pedido_demissao" });
    const datas = concentrarBancoNoFinal(b, 440);
    expect(datas).toEqual([b.ultimoComparecimento]);
  });
});

describe("Saída da escala da loja", () => {
  it("usa o último dia de trabalho quando é anterior ao término do contrato", () => {
    expect(ultimoDiaNaEscala(null, "2026-10-28")).toBe("2026-10-28");
    expect(ultimoDiaNaEscala("2026-11-06", "2026-10-28")).toBe("2026-10-28");
    expect(ultimoDiaNaEscala("2026-11-06", null)).toBe("2026-11-06");
  });
});
