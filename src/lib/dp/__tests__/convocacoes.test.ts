import { describe, it, expect } from "vitest";
import {
  horasAceitas,
  podeConvocar,
  podeResponder,
  prazoExpirado,
  snapshotDaConvocacao,
  statusEfetivo,
  validarConvocacao,
} from "@/lib/dp/convocacoes";

const agora = new Date("2026-07-27T12:00:00Z");

describe("convocacoes", () => {
  it("permite convocar apenas intermitentes", () => {
    expect(podeConvocar("intermitente")).toBe(true);
    expect(podeConvocar("clt")).toBe(false);
    expect(podeConvocar(null)).toBe(false);
  });

  it("detecta prazo expirado", () => {
    expect(prazoExpirado("2026-07-26T12:00:00Z", agora)).toBe(true);
    expect(prazoExpirado("2026-07-28T12:00:00Z", agora)).toBe(false);
    expect(prazoExpirado(null, agora)).toBe(false);
  });

  it("converte pendente vencida em expirada", () => {
    expect(statusEfetivo({ status: "pendente", prazo_resposta: "2026-07-26T12:00:00Z" }, agora)).toBe("expirada");
    expect(statusEfetivo({ status: "aceita", prazo_resposta: null }, agora)).toBe("aceita");
    expect(podeResponder({ status: "pendente", prazo_resposta: "2026-07-28T00:00:00Z" }, agora)).toBe(true);
    expect(podeResponder({ status: "pendente", prazo_resposta: "2026-07-01T00:00:00Z" }, agora)).toBe(false);
  });

  it("calcula o snapshot de horário com intervalo", () => {
    const s = snapshotDaConvocacao({ data: "2026-08-01", entrada: "17:00", saida: "23:00", intervalo_minutos: 60 });
    expect(s.carga_prevista_horas).toBe(5);
    expect(s.termina_no_dia_seguinte).toBe(false);
  });

  it("marca virada de dia", () => {
    const s = snapshotDaConvocacao({ data: "2026-08-01", entrada: "18:00", saida: "01:00", intervalo_minutos: 0 });
    expect(s.termina_no_dia_seguinte).toBe(true);
    expect(s.carga_prevista_horas).toBe(7);
  });

  it("valida regime, data, carga, prazo e duplicidade", () => {
    const base = { data: "2026-08-01", entrada: "17:00", saida: "23:00", intervalo_minutos: 60 };

    expect(
      validarConvocacao({ colaboradorId: "c1", regime: "intermitente", input: base, existentes: [], agora }),
    ).toEqual([]);

    const clt = validarConvocacao({ colaboradorId: "c1", regime: "clt", input: base, existentes: [], agora });
    expect(clt.map((e) => e.campo)).toContain("colaborador");

    const dup = validarConvocacao({
      colaboradorId: "c1",
      regime: "intermitente",
      input: base,
      existentes: [{ data: "2026-08-01", status: "pendente", prazo_resposta: null }],
      agora,
    });
    expect(dup.map((e) => e.campo)).toContain("duplicidade");

    const prazo = validarConvocacao({
      colaboradorId: "c1",
      regime: "intermitente",
      input: { ...base, prazo_resposta: "2026-07-01T00:00:00Z" },
      existentes: [],
      agora,
    });
    expect(prazo.map((e) => e.campo)).toContain("prazo");
  });

  it("soma somente as horas aceitas", () => {
    expect(
      horasAceitas([
        { status: "aceita", carga_prevista_horas: 5 },
        { status: "pendente", carga_prevista_horas: 8 },
        { status: "aceita", carga_prevista_horas: 3.5 },
        { status: "recusada", carga_prevista_horas: 6 },
      ]),
    ).toBe(8.5);
  });
});
