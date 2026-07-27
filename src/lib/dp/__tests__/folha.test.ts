import { describe, expect, it } from "vitest";
import { folhaParaCsv, lerDetalhe, proximoStatusPeriodo, totaisDaFolha, type LinhaFolha } from "@/lib/dp/folha";

const linha = (over: Partial<LinhaFolha>): LinhaFolha => ({
  id: over.id ?? "1",
  colaborador_id: "c1",
  nome: over.nome ?? "Ana",
  status: over.status ?? "rascunho",
  valor_bruto: over.valor_bruto ?? 1000,
  valor_liquido: over.valor_liquido ?? 900,
  detalhe: over.detalhe ?? lerDetalhe({ faltas: 100, proventos: { normais: 1000 } }),
});

describe("lerDetalhe", () => {
  it("preenche zeros para payload vazio ou inválido", () => {
    const d = lerDetalhe(null);
    expect(d.faltas).toBe(0);
    expect(d.proventos.extras50).toBe(0);
    expect(d.horas.diasFalta).toBe(0);
  });

  it("lê proventos e horas do JSON da apuração", () => {
    const d = lerDetalhe({ faltas: 50, dsr: 25, proventos: { normais: 800, extras50: 90 }, horas: { normais: 8800 } });
    expect(d.dsr).toBe(25);
    expect(d.proventos.extras50).toBe(90);
    expect(d.horas.normais).toBe(8800);
  });
});

describe("totaisDaFolha", () => {
  it("soma bruto/líquido e ignora cancelados", () => {
    const t = totaisDaFolha([
      linha({ id: "1" }),
      linha({ id: "2", status: "aprovado_dp", valor_bruto: 500, valor_liquido: 500 }),
      linha({ id: "3", status: "cancelado", valor_bruto: 999, valor_liquido: 999 }),
    ]);
    expect(t.bruto).toBe(1500);
    expect(t.liquido).toBe(1400);
    expect(t.descontos).toBe(100);
    expect(t.rascunho).toBe(1);
    expect(t.aprovados).toBe(1);
    expect(t.cancelados).toBe(1);
  });
});

describe("proximoStatusPeriodo", () => {
  it("avança no ciclo e para em pago", () => {
    expect(proximoStatusPeriodo("aberto")).toBe("fechado");
    expect(proximoStatusPeriodo("aprovado_dp")).toBe("aprovado_financeiro");
    expect(proximoStatusPeriodo("pago")).toBeNull();
  });
});

describe("folhaParaCsv", () => {
  it("usa ; como separador e vírgula decimal", () => {
    const csv = folhaParaCsv("2026-07", [linha({ nome: "Ana" })]);
    const [cab, corpo] = csv.split("\n");
    expect(cab.split(";")).toHaveLength(11);
    expect(corpo).toContain('"900,00"');
    expect(corpo).toContain('"Rascunho"');
  });
});
