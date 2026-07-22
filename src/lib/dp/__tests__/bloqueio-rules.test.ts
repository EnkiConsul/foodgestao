import { describe, it, expect } from "vitest";
import {
  expandRegraNoIntervalo,
  buildBloqueiosDeRegras,
  type RegraRow,
} from "../bloqueio-rules";

const baseRegra = (over: Partial<RegraRow>): RegraRow => ({
  id: "r1",
  company_id: "c1",
  nome: "Regra",
  tipo: "fixa_anual",
  mes: null,
  dia: null,
  regra_json: null,
  ativo: true,
  ...over,
});

describe("expandRegraNoIntervalo", () => {
  it("fixa_anual: expande dias × meses para o ano visível", () => {
    const r = baseRegra({
      tipo: "fixa_anual",
      regra_json: {
        aplicacao: "anual",
        meses: [6, 12],
        dias: [12, 24],
      },
    });
    const set = expandRegraNoIntervalo(
      r,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );
    expect(set.has("2026-06-12")).toBe(true);
    expect(set.has("2026-06-24")).toBe(true);
    expect(set.has("2026-12-12")).toBe(true);
    expect(set.has("2026-12-24")).toBe(true);
    expect(set.size).toBe(4);
  });

  it("fixa_anual: descarta dia inválido para o mês (30/02)", () => {
    const r = baseRegra({
      tipo: "fixa_anual",
      regra_json: { meses: [2], dias: [30] },
    });
    const set = expandRegraNoIntervalo(
      r,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );
    expect(set.size).toBe(0);
  });

  it("dinamica: 2º domingo de maio (Dia das Mães) resolve corretamente", () => {
    const r = baseRegra({
      tipo: "dinamica",
      regra_json: {
        aplicacao: "anual",
        meses: [5],
        ordinal: 2,
        dia_semana: 0,
      },
    });
    const set = expandRegraNoIntervalo(
      r,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );
    // 10 de maio de 2026 é domingo (2º)
    expect(Array.from(set)).toEqual(["2026-05-10"]);
  });

  it("pos_pagamento: bloqueia 1º sábado após dia 5 e o domingo seguinte", () => {
    const r = baseRegra({
      tipo: "dinamica",
      regra_json: {
        meses: [1],
        tipo_original: "pos_pagamento",
        pos_pagamento_dia: 5,
      },
    });
    const set = expandRegraNoIntervalo(
      r,
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
    );
    // Em jan/2026: dia 5 é seg → primeiro sábado depois = 10, domingo = 11
    expect(set.has("2026-01-10")).toBe(true);
    expect(set.has("2026-01-11")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("aplicação única: só aplica no ano de referência", () => {
    const r = baseRegra({
      tipo: "fixa_anual",
      regra_json: {
        aplicacao: "unica",
        ano_referencia: 2027,
        meses: [3],
        dias: [15],
      },
    });
    const s2026 = expandRegraNoIntervalo(
      r,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );
    const s2027 = expandRegraNoIntervalo(
      r,
      new Date(2027, 0, 1),
      new Date(2027, 11, 31),
    );
    expect(s2026.size).toBe(0);
    expect(s2027.has("2027-03-15")).toBe(true);
  });

  it("regra inativa não retorna nada", () => {
    const r = baseRegra({
      ativo: false,
      tipo: "fixa_anual",
      regra_json: { meses: [1], dias: [1] },
    });
    const set = expandRegraNoIntervalo(
      r,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );
    expect(set.size).toBe(0);
  });
});

describe("buildBloqueiosDeRegras (filtro por unidade)", () => {
  const r1 = baseRegra({
    id: "r1",
    nome: "Global",
    tipo: "fixa_anual",
    regra_json: { meses: [1], dias: [1] },
  });
  const r2 = baseRegra({
    id: "r2",
    nome: "Unidade A",
    tipo: "fixa_anual",
    regra_json: { meses: [1], dias: [2] },
  });

  it("regra sem vínculo aplica em qualquer unidade (inclusive nula)", () => {
    const m = buildBloqueiosDeRegras({
      regras: [r1],
      vinculos: [],
      unidadeId: null,
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 31),
    });
    expect(m.get("2026-01-01")).toBe("Global");
  });

  it("regra com vínculo só aplica se unidade coincidir", () => {
    const m = buildBloqueiosDeRegras({
      regras: [r2],
      vinculos: [{ regra_id: "r2", unidade_id: "uA" }],
      unidadeId: "uB",
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 31),
    });
    expect(m.size).toBe(0);
  });

  it("motivo = nome da primeira regra que casa", () => {
    const rDup = baseRegra({
      id: "rdup",
      nome: "Duplicada",
      tipo: "fixa_anual",
      regra_json: { meses: [1], dias: [1] },
    });
    const m = buildBloqueiosDeRegras({
      regras: [r1, rDup],
      vinculos: [],
      unidadeId: null,
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 31),
    });
    expect(m.get("2026-01-01")).toBe("Global");
  });
});
