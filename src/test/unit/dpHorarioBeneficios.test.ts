import { describe, expect, it } from "vitest";
import {
  copiarHorarioEntreDias, definirHorarioNoDia, diaDivergeDoBase, diasPadrao, horarioEfetivoDia,
} from "@/lib/dp/config-trabalho";
import {
  alertaIsonomia, alertasBeneficioAlimentacao, calcularBeneficioMes, termoDispensaTexto,
} from "@/lib/dp/beneficios-regras";
import { premioAssiduidadeBase, valeAlimentacaoDoMes } from "@/lib/dp/remuneracao";

const base = { entrada: "08:00", saida: "17:00", intervalo_minutos: 60 };

describe("horário por dia", () => {
  it("usa o horário base quando o dia não tem horário próprio", () => {
    const dias = diasPadrao();
    expect(horarioEfetivoDia(dias[0], base)).toEqual(base);
    expect(diaDivergeDoBase(dias[0], base)).toBe(false);
  });

  it("grava horário próprio e sinaliza a divergência", () => {
    const dias = definirHorarioNoDia(diasPadrao(), 3, { entrada: "10:00", saida: "19:00", intervalo_minutos: 60 });
    const quarta = dias.find((d) => d.dow === 3)!;
    expect(horarioEfetivoDia(quarta, base).entrada).toBe("10:00");
    expect(diaDivergeDoBase(quarta, base)).toBe(true);
  });

  it("repete o horário de um dia nos dias escolhidos, inclusive em folgas", () => {
    let dias = definirHorarioNoDia(diasPadrao(), 3, { entrada: "10:00", saida: "19:00", intervalo_minutos: 30 });
    dias = dias.map((d) => (d.dow === 5 ? { ...d, trabalha: false } : d));
    dias = copiarHorarioEntreDias(dias, 3, [4, 5], base);
    for (const dow of [4, 5]) {
      const d = dias.find((x) => x.dow === dow)!;
      expect(d.trabalha).toBe(true);
      expect(d.entrada).toBe("10:00");
      expect(d.intervalo_minutos).toBe(30);
    }
  });
});

describe("benefícios", () => {
  it("calcula valor diário no mês com desconto percentual", () => {
    const c = calcularBeneficioMes({
      valor: 25, periodicidade: "diario", dias_base: 22, desconto_tipo: "percentual", desconto_valor: 10,
    });
    expect(c.bruto).toBe(550);
    expect(c.desconto).toBe(55);
    expect(c.liquido).toBe(495);
    expect(c.percentualEfetivo).toBe(10);
  });

  it("limita o desconto fixo ao valor concedido", () => {
    const c = calcularBeneficioMes({ valor: 100, desconto_tipo: "valor", desconto_valor: 500 });
    expect(c.desconto).toBe(100);
    expect(c.liquido).toBe(0);
  });

  it("avisa sobre risco salarial quando não há coparticipação", () => {
    const a = alertasBeneficioAlimentacao({ valor: 600, desconto_tipo: "nenhum" });
    expect(a.some((x) => x.codigo === "va_sem_desconto")).toBe(true);
  });

  it("não avisa quando há desconto dentro da praxe", () => {
    const a = alertasBeneficioAlimentacao({ valor: 600, desconto_tipo: "percentual", desconto_valor: 1 });
    expect(a.some((x) => x.codigo === "va_sem_desconto")).toBe(false);
    expect(a.some((x) => x.codigo === "va_indenizatorio")).toBe(true);
  });

  it("alerta isonomia só com colegas equivalentes que mantêm o benefício", () => {
    const colegas = [
      { colaborador_id: "1", nome: "Ana", cargo_id: "c1", unidade_id: "u1", ativo: true },
      { colaborador_id: "2", nome: "Bruno", cargo_id: "c2", unidade_id: "u1", ativo: true },
      { colaborador_id: "3", nome: "Caio", cargo_id: "c1", unidade_id: "u1", ativo: false },
    ];
    const alerta = alertaIsonomia("vale-alimentação", colegas, { cargo_id: "c1", unidade_id: "u1" });
    expect(alerta?.colegas).toEqual(["Ana"]);
    expect(alertaIsonomia("vale", colegas, { cargo_id: "c9", unidade_id: "u1" })).toBeNull();
  });

  it("gera o termo de dispensa com o nome do benefício", () => {
    const t = termoDispensaTexto({ empresa: "Loja X", colaborador: "Ana", beneficio: "vale-alimentação" });
    expect(t[0]).toContain("Ana");
    expect(t[0]).toContain("vale-alimentação");
  });
});

describe("remuneração", () => {
  it("prêmio percentual incide sobre o salário", () => {
    expect(premioAssiduidadeBase({ premio_assiduidade_tipo: "percentual", premio_assiduidade_valor: 5 }, 2000))
      .toBe(100);
    expect(premioAssiduidadeBase({ premio_assiduidade_tipo: "valor", premio_assiduidade_valor: 150 }, 2000))
      .toBe(150);
  });

  it("vale-alimentação desativado não gera valor", () => {
    expect(valeAlimentacaoDoMes({ vale_alimentacao: false, vale_alimentacao_valor: 500 }).bruto).toBe(0);
  });
});
