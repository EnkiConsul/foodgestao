import { describe, it, expect } from "vitest";
import { simularDesligamento, modalidadePersistida, ehDispensaCumprimento, type ResultadoDesligamento } from "../compensacao/desligamentoMotor";

const J: [number, number, number, number, number, number, number] = [0, 480, 480, 480, 480, 480, 480];
const BASE = { dataAdmissao: "2024-01-10", dataComunicacao: "2026-10-01", jornadaSemanal: J };
const ok = (r: ReturnType<typeof simularDesligamento>) => { if ("erro" in r) throw new Error(r.erro); return r as ResultadoDesligamento; };

describe("modalidade gravada do processo", () => {
  it("Caso A (pedido com cumprimento dispensado) grava dispensado_cumprimento, nunca indenizado", () => {
    const r = ok(simularDesligamento({ ...BASE, motivo: "pedido_demissao", modalidade: "indenizado", descontarAviso: false }));
    expect(modalidadePersistida("indenizado", r)).toBe("dispensado_cumprimento");
    expect(r.diasProjetadosIndenizados).toBe(0);
  });
  it("dispensa sem justa causa indenizada continua indenizado", () => {
    const r = ok(simularDesligamento({ ...BASE, motivo: "dispensa_sem_justa_causa", modalidade: "indenizado" }));
    expect(modalidadePersistida("indenizado", r)).toBe("indenizado");
  });
  it("processo gravado é reconhecido como dispensa pela modalidade, sem depender de outro campo", () => {
    expect(ehDispensaCumprimento({ modalidade: "dispensado_cumprimento" })).toBe(true);
    expect(ehDispensaCumprimento({ modalidade: "indenizado" })).toBe(false);
  });
});
