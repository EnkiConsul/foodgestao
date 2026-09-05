import { describe, it, expect } from "vitest";
import {
  resolverJanela,
  podeMarcarNormal,
  distribuirFolgasAutomaticas,
  diasFdsDoMes,
  mesKey,
  type DiaCandidato,
} from "@/lib/dp/folga-janela";

const cfg = { ativa: true, abreDia: 10, fechaDia: 20 };

describe("resolverJanela", () => {
  it("antes da abertura", () => {
    const j = resolverJanela(cfg, new Date(2026, 8, 9));
    expect(j.estado).toBe("antes");
  });

  it("no dia da abertura já está aberta", () => {
    expect(resolverJanela(cfg, new Date(2026, 8, 10)).estado).toBe("aberta");
  });

  it("no dia do encerramento ainda está aberta", () => {
    expect(resolverJanela(cfg, new Date(2026, 8, 20)).estado).toBe("aberta");
  });

  it("depois do encerramento", () => {
    expect(resolverJanela(cfg, new Date(2026, 8, 21)).estado).toBe("encerrada");
  });

  it("competência é sempre o mês seguinte", () => {
    expect(resolverJanela(cfg, new Date(2026, 8, 15)).competenciaKey).toBe("2026-10");
    expect(resolverJanela(cfg, new Date(2026, 11, 15)).competenciaKey).toBe("2027-01");
  });

  it("janela inativa mantém o comportamento antigo", () => {
    const j = resolverJanela({ ...cfg, ativa: false }, new Date(2026, 8, 25));
    expect(j.estado).toBe("inativa");
    expect(podeMarcarNormal(j, new Date(2026, 8, 27))).toBe(true);
  });
});

describe("podeMarcarNormal", () => {
  const aberta = resolverJanela(cfg, new Date(2026, 8, 15));

  it("permite apenas datas do mês-alvo", () => {
    expect(podeMarcarNormal(aberta, new Date(2026, 9, 4))).toBe(true);
    expect(podeMarcarNormal(aberta, new Date(2026, 8, 27))).toBe(false);
    expect(podeMarcarNormal(aberta, new Date(2026, 10, 1))).toBe(false);
  });

  it("bloqueia fora da janela", () => {
    const encerrada = resolverJanela(cfg, new Date(2026, 8, 25));
    expect(podeMarcarNormal(encerrada, new Date(2026, 9, 4))).toBe(false);
  });
});

describe("diasFdsDoMes", () => {
  it("lista domingos do mês", () => {
    expect(diasFdsDoMes(new Date(2026, 9, 1), [0])).toEqual([
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
    ]);
  });

  it("inclui sábados quando a empresa folga no sábado", () => {
    const dias = diasFdsDoMes(new Date(2026, 9, 1), [0, 6]);
    expect(dias).toContain("2026-10-03");
    expect(dias.length).toBe(9);
  });
});

const dias = (ocupacoes: Record<string, number>, limite: number | null): DiaCandidato[] =>
  Object.entries(ocupacoes).map(([data, ocupacao]) => ({ data, ocupacao, limite }));

describe("distribuirFolgasAutomaticas", () => {
  it("quem já cumpriu não recebe nada", () => {
    const r = distribuirFolgasAutomaticas(
      [{ colaboradorId: "a", faltam: 0 }],
      dias({ "2026-10-04": 0 }, 2),
    );
    expect(r).toEqual([]);
  });

  it("prioriza dias vazios", () => {
    const r = distribuirFolgasAutomaticas(
      [{ colaboradorId: "a", faltam: 1 }],
      dias({ "2026-10-04": 1, "2026-10-11": 0, "2026-10-18": 1 }, 2),
    );
    expect(r[0].data).toBe("2026-10-11");
    expect(r[0].excedido).toBe(false);
  });

  it("sem dias vazios, usa o de menor ocupação", () => {
    const r = distribuirFolgasAutomaticas(
      [{ colaboradorId: "a", faltam: 1 }],
      dias({ "2026-10-04": 3, "2026-10-11": 1, "2026-10-18": 2 }, 4),
    );
    expect(r[0].data).toBe("2026-10-11");
  });

  it("com tudo lotado começa pelos últimos dias do mês e registra o excesso", () => {
    const r = distribuirFolgasAutomaticas(
      [{ colaboradorId: "a", faltam: 1 }],
      dias({ "2026-10-04": 2, "2026-10-11": 2, "2026-10-25": 2 }, 2),
    );
    expect(r[0].data).toBe("2026-10-25");
    expect(r[0].excedido).toBe(true);
    expect(r[0].limite).toBe(2);
    expect(r[0].ocupacaoAnterior).toBe(2);
  });

  it("distribui vários colaboradores equilibrando a ocupação", () => {
    const r = distribuirFolgasAutomaticas(
      [
        { colaboradorId: "a", faltam: 1 },
        { colaboradorId: "b", faltam: 1 },
        { colaboradorId: "c", faltam: 1 },
      ],
      dias({ "2026-10-04": 0, "2026-10-11": 0, "2026-10-18": 0 }, 1),
    );
    expect(r.map((x) => x.data)).toEqual(["2026-10-04", "2026-10-11", "2026-10-18"]);
    expect(r.every((x) => !x.excedido)).toBe(true);
  });

  it("não repete o mesmo dia para o mesmo colaborador", () => {
    const r = distribuirFolgasAutomaticas(
      [{ colaboradorId: "a", faltam: 2 }],
      dias({ "2026-10-04": 0, "2026-10-11": 0 }, 5),
    );
    expect(new Set(r.map((x) => x.data)).size).toBe(2);
  });

  it("dia sem limite definido nunca conta como excesso", () => {
    const r = distribuirFolgasAutomaticas(
      [{ colaboradorId: "a", faltam: 1 }],
      dias({ "2026-10-04": 9 }, null),
    );
    expect(r[0].excedido).toBe(false);
  });
});

describe("mesKey", () => {
  it("formata com dois dígitos", () => {
    expect(mesKey(new Date(2026, 0, 5))).toBe("2026-01");
  });
});
