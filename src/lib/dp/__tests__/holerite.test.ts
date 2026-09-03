import { describe, expect, it } from "vitest";
import { lerDetalhe } from "@/lib/dp/folha";
import { calcularInss } from "@/lib/dp/encargos";
import {
  holeriteDocumento,
  linhasDoHolerite,
  totaisDoHolerite,
  type HoleriteDados,
} from "@/lib/dp/holerite";

const base = (over: Partial<HoleriteDados> = {}): HoleriteDados => ({
  empresa: "Aveto 360 <Garavelo>",
  colaborador: "Karine",
  cargo: "Atendente",
  competencia: "2026-06",
  tipo: "contracheque_mensal",
  detalhe: lerDetalhe({
    faltas: 100,
    dsr: 20,
    proventos: { normais: 1800, extras50: 150, extras100: 0, noturno: 0 },
    horas: { normais: 220, extras50: 10, extras100: 0, noturnos: 0, falta: 8, atraso: 0, diasFalta: 1, dsrPerdidos: 1 },
  }),
  valorBruto: 1950,
  valorLiquido: 1830,
  dataPagamento: "2026-07-05",
  ...over,
});

describe("holerite", () => {
  it("omite rubricas zeradas mas mantém horas normais", () => {
    const linhas = linhasDoHolerite(base());
    const descricoes = linhas.map((l) => l.descricao);
    expect(descricoes).toEqual(["Horas normais", "Horas extras 50%", "Faltas", "DSR sobre faltas", "INSS"]);
  });

  it("mantém horas normais mesmo sem valor", () => {
    const d = base();
    const linhas = linhasDoHolerite({
      ...d,
      detalhe: { ...d.detalhe, proventos: { normais: 0, extras50: 0, extras100: 0, noturno: 0 }, faltas: 0, dsr: 0 },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].descricao).toBe("Horas normais");
  });

  it("soma proventos e descontos", () => {
    const t = totaisDoHolerite(linhasDoHolerite(base()));
    const inss = calcularInss(1830);
    expect(t.proventos).toBe(1950);
    expect(t.descontos).toBe(120 + inss);
    expect(t.liquido).toBe(1830 - inss);
  });

  it("escapa HTML e gera um documento por colaborador", () => {
    const html = holeriteDocumento("Folha", [base(), base({ colaborador: "João" })]);
    expect(html).toContain("Aveto 360 &lt;Garavelo&gt;");
    expect(html).not.toContain("<Garavelo>");
    expect(html.match(/class="holerite"/g)).toHaveLength(2);
  });
});
