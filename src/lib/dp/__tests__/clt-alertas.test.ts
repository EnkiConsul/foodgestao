import { describe, it, expect } from "vitest";
import { verificarAlertasClt, idadeNaData, temAlertaClt } from "@/lib/dp/clt-alertas";
import { encontrarTurnoEquivalente, resolverTurnoDoHorario } from "@/lib/dp/turno-resolver";

const dia = (dow: number, entrada: string, saida: string, intervalo = 60) =>
  ({ dow, trabalha: true, entrada, saida, intervalo_minutos: intervalo });
const folga = (dow: number) => ({ dow, trabalha: false });

const semana6x1 = [
  dia(1, "08:00", "17:00"), dia(2, "08:00", "17:00"), dia(3, "08:00", "17:00"),
  dia(4, "08:00", "17:00"), dia(5, "08:00", "17:00"), dia(6, "08:00", "12:00", 0),
  folga(0),
];

describe("clt-alertas", () => {
  it("não gera aviso para 6x1 de 8h com folga no domingo", () => {
    const alertas = verificarAlertasClt({ dias: semana6x1, regime: "clt", idade: 30 });
    expect(temAlertaClt(alertas)).toBe(false);
  });

  it("avisa quando a semana passa de 44h", () => {
    const alertas = verificarAlertasClt({
      dias: semana6x1.map((d) => (d.trabalha ? dia(d.dow, "08:00", "19:00") : d)),
      regime: "clt",
    });
    expect(alertas.map((a) => a.codigo)).toContain("carga_semanal");
    expect(alertas.map((a) => a.codigo)).toContain("carga_diaria");
  });

  it("avisa menor de 18 anos depois das 22h e acima de 6h", () => {
    const alertas = verificarAlertasClt({
      dias: [dia(1, "16:00", "23:00", 0), folga(0)],
      idade: 17,
      regime: "clt",
    });
    const codigos = alertas.map((a) => a.codigo);
    expect(codigos).toContain("menor_noturno");
    expect(codigos).toContain("menor_carga_diaria");
  });

  it("avisa interjornada abaixo de 11 horas", () => {
    const alertas = verificarAlertasClt({
      dias: [dia(1, "08:00", "23:00", 60), dia(2, "08:00", "17:00"), folga(0)],
      regime: "clt",
    });
    expect(alertas.map((a) => a.codigo)).toContain("interjornada");
  });

  it("avisa semana sem folga", () => {
    const alertas = verificarAlertasClt({
      dias: [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, "08:00", "14:00", 15)),
      regime: "clt",
    });
    expect(alertas.map((a) => a.codigo)).toContain("sem_folga_semanal");
  });

  it("ignora carga celetista para PJ", () => {
    const alertas = verificarAlertasClt({
      dias: [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, "08:00", "20:00")),
      regime: "pj",
    });
    expect(alertas.every((a) => a.severidade === "info")).toBe(true);
  });

  it("calcula idade na data de referência", () => {
    expect(idadeNaData("2009-06-01", "2026-05-31")).toBe(16);
    expect(idadeNaData("2009-06-01", "2026-06-01")).toBe(17);
  });
});

describe("turno-resolver", () => {
  const turnos = [
    { id: "t1", nome: "Comercial", entrada: "08:00", saida: "17:00", intervalo_minutos: 60, unidade_id: "u1" },
    { id: "t2", nome: "Noite", entrada: "18:00", saida: "23:00", intervalo_minutos: 0, unidade_id: "u1" },
  ];

  it("reaproveita turno com o mesmo horário", () => {
    const r = resolverTurnoDoHorario({ entrada: "08:00", saida: "17:00", intervalo_minutos: 60 }, turnos, "u1");
    expect(r).toEqual({ tipo: "reaproveita", turno: turnos[0] });
  });

  it("cria novo horário quando não existe equivalente", () => {
    const r = resolverTurnoDoHorario({ entrada: "09:00", saida: "18:00", intervalo_minutos: 60 }, turnos, "u1");
    expect(r.tipo).toBe("cria");
  });

  it("não reaproveita turno de outra unidade", () => {
    expect(encontrarTurnoEquivalente(
      { entrada: "08:00", saida: "17:00", intervalo_minutos: 60 },
      turnos,
      "u2",
    )).toBeNull();
  });
});

describe("clt-alertas por regime de contrato", () => {
  it("não valida carga semanal nem DSR no intermitente (só disponibilidade)", () => {
    const dias = [
      dia(1, "08:00", "19:00"), dia(2, "08:00", "19:00"), dia(3, "08:00", "19:00"),
      dia(4, "08:00", "19:00"), dia(5, "08:00", "19:00"), dia(6, "08:00", "19:00"),
      dia(0, "08:00", "19:00"),
    ];
    const codigos = verificarAlertasClt({ dias, regime: "intermitente", idade: 30 })
      .map((a) => a.codigo);
    expect(codigos).not.toContain("carga_semanal");
    expect(codigos).not.toContain("sem_folga");
  });

  it("mantém as regras de menor de idade mesmo em regimes sem carga semanal", () => {
    const codigos = verificarAlertasClt({
      dias: [dia(1, "16:00", "23:30", 0), folga(0)],
      regime: "pj",
      idade: 17,
    }).map((a) => a.codigo);
    expect(codigos).toContain("menor_noturno");
  });

  it("aponta ausência de folga na CLT quando todos os dias são trabalhados", () => {
    const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, "08:00", "14:00", 0));
    const codigos = verificarAlertasClt({ dias, regime: "clt", idade: 30 }).map((a) => a.codigo);
    expect(codigos).toContain("sem_folga");
  });

  it("folga variável não gera aviso de ausência de folga", () => {
    const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, "08:00", "14:00", 0));
    const codigos = verificarAlertasClt({ dias, regime: "clt", idade: 30, folgaVariavel: true })
      .map((a) => a.codigo);
    expect(codigos).not.toContain("sem_folga");
  });
});
