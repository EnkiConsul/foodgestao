import { describe, it, expect } from "vitest";
import { bloqueiosEfetivosUnidade, type RegraRow } from "../bloqueio-rules";
import { limiteComFolgaFixaDiaUtil } from "../folga-limites";
import { folgaFixaDoDia } from "../calendario-rotina";

const regra: RegraRow = { id: "r1", company_id: "c", nome: "Dia das Mães", tipo: "dinamica", mes: null, dia: null, ativo: true,
  regra_json: { meses: [5], ordinal: 2, dia_semana: 0 } };
const intervalo = { from: new Date(2026, 4, 1), to: new Date(2026, 4, 31) };

describe("bloqueios do novo calendário", () => {
  it("regra recorrente bloqueia a data mesmo sem registro manual", () => {
    const m = bloqueiosEfetivosUnidade({ datas: [], regras: [regra], vinculos: [], unidadeId: "u1", ...intervalo });
    expect(m.get("2026-05-10")?.motivo).toBe("Dia das Mães");
  });
  it("liberação da unidade vence a regra recorrente", () => {
    const m = bloqueiosEfetivosUnidade({
      datas: [{ id: "d1", data: "2026-05-10", motivo: null, liberada: true, unidade_id: "u1" }],
      regras: [regra], vinculos: [], unidadeId: "u1", ...intervalo,
    });
    expect(m.has("2026-05-10")).toBe(false);
  });
  it("regra vinculada a outra unidade não bloqueia", () => {
    const m = bloqueiosEfetivosUnidade({ datas: [], regras: [regra], vinculos: [{ regra_id: "r1", unidade_id: "u2" }], unidadeId: "u1", ...intervalo });
    expect(m.size).toBe(0);
  });
});

describe("limite em dia útil", () => {
  it("segunda sem exceção usa quem tem folga fixa no dia", () => {
    const r = limiteComFolgaFixaDiaUtil("2026-10-12", { limite: null, origem: "sem_limite" } as never, new Map([[1, 3]]));
    expect(r.limite).toBe(3);
  });
  it("exceção explícita da data prevalece sobre o piso das folgas fixas", () => {
    const r = limiteComFolgaFixaDiaUtil("2026-10-12", { limite: 1, origem: "excecao_data" } as never, new Map([[1, 3]]));
    expect(r.limite).toBe(1);
    expect(r.origem).toBe("excecao_data");
  });
  it("regra do gestor acima das fixas prevalece; abaixo, sobe para as fixas", () => {
    expect(limiteComFolgaFixaDiaUtil("2026-10-12", { limite: 6, origem: "regra_recorrente" } as never, new Map([[1, 5]])).limite).toBe(6);
    expect(limiteComFolgaFixaDiaUtil("2026-10-12", { limite: 2, origem: "regra_recorrente" } as never, new Map([[1, 5]])).limite).toBe(5);
  });
});

describe("folga fixa no domingo", () => {
  it("folga fixa sem troca é identificada; troca não", () => {
    expect(folgaFixaDoDia("2026-10-11", { folga_fixa_dows: [0] })).toBe(true);
    expect(folgaFixaDoDia("2026-10-11", { troca: true, folga_fixa_dows: [0] })).toBe(false);
  });
  it("domingo: quem folga padrão também conta no limite do dia", () => {
    // 2026-10-11 é domingo: as 2 folgas fixas são o piso, mesmo com regra de 1 vaga.
    const r = limiteComFolgaFixaDiaUtil("2026-10-11", { limite: 1, origem: "regra_recorrente" } as never, new Map([[0, 2]]));
    expect(r.limite).toBe(2);
    expect(r.origem).toBe("folga_fixa");
  });
  it("sábado sem limite cadastrado usa as folgas fixas do dia", () => {
    const r = limiteComFolgaFixaDiaUtil("2026-10-10", { limite: null, origem: "sem_limite" } as never, new Map([[6, 2]]));
    expect(r.limite).toBe(2);
  });
});
