import { describe, it, expect } from "vitest";
import { jornadasDaConfig } from "@/lib/dp/compensacao/jornadasColaborador";
import { simularDesligamento } from "@/lib/dp/compensacao/desligamentoMotor";
import * as servidorMotor from "../../../../supabase/functions/_shared/desligamento-motor.ts";
import { jornadaSemanalDaConfig } from "../../../../supabase/functions/_shared/desligamento-jornada.ts";
import { prazoLegalRescisao } from "@/lib/dp/desligamento";

const turnos = [
  { id: "t1", nome: "Almoço", entrada: "10:00", saida: "18:20", intervalo_minutos: 60, cor: null },
  { id: "t2", nome: "Noite", entrada: "18:00", saida: "02:00", intervalo_minutos: 30, cor: null },
];
const dias = [
  { dow: 0, trabalha: false, turno_id: null },
  { dow: 1, trabalha: true, turno_id: null },
  { dow: 2, trabalha: true, turno_id: "t2" },
  { dow: 3, trabalha: true, turno_id: null, entrada: "09:00", saida: "13:00", intervalo_minutos: 0 },
  { dow: 4, trabalha: true, turno_id: null },
  { dow: 5, trabalha: true, turno_id: "t2" },
  { dow: 6, trabalha: true, turno_id: null },
];

describe("Fase 3 — fonte única navegador/servidor", () => {
  it("calculadora e servidor usam a mesma função do motor", () => {
    expect(simularDesligamento).toBe(servidorMotor.simularDesligamento);
  });
  it("jornada do servidor = jornada da calculadora (paridade)", () => {
    const calc = jornadasDaConfig(dias, "t1", turnos);
    const srv = jornadaSemanalDaConfig(dias, "t1", turnos);
    const porDow = Array(7).fill(0);
    for (const j of calc.jornadas) for (const d of j.dows ?? []) porDow[d] = j.minutos;
    expect(srv.semana).toEqual(porDow);
    expect(srv.incompletos).toEqual(calc.incompletos);
  });
  it("dia sem horário resolvível fica incompleto, nunca inventado", () => {
    const srv = jornadaSemanalDaConfig([{ dow: 1, trabalha: true, turno_id: null }], null, []);
    expect(srv.incompletos).toEqual([1]);
    expect(srv.semana[1]).toBe(0);
  });
  it("10º dia corrido igual no motor e no utilitário canônico", () => {
    const r = simularDesligamento({ dataAdmissao: "2022-09-01", dataComunicacao: "2026-10-01", modalidade: "trabalhado", reducao: "sete_dias", jornadaSemanal: [0, 480, 480, 480, 480, 480, 240] });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.prazoQuitacao).toBe(prazoLegalRescisao(r.baseQuitacao));
    expect(r.ultimoComparecimento).toBe("2026-10-24");
    expect(r.fimPeriodoCumprido).toBe("2026-10-31");
  });
});
