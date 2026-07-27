import { describe, expect, it } from "vitest";
import {
  anosCompletos,
  avosFeriasProporcionais,
  diasDeAvisoPrevio,
  percentualMultaFgts,
  verbasDaRescisao,
} from "../rescisao";

const base = { salarioBase: 3000, admissao: "2023-01-10", desligamento: "2026-06-20" } as const;

describe("rescisão (Fase 19)", () => {
  it("conta anos completos de casa", () => {
    expect(anosCompletos("2023-01-10", "2026-06-20")).toBe(3);
    expect(anosCompletos("2023-07-10", "2026-06-20")).toBe(2);
  });

  it("aviso prévio: 30 dias + 3 por ano, limitado a 90", () => {
    expect(diasDeAvisoPrevio("2023-01-10", "2026-06-20", "dispensa_sem_justa_causa")).toBe(39);
    expect(diasDeAvisoPrevio("1990-01-01", "2026-06-20", "dispensa_sem_justa_causa")).toBe(90);
    expect(diasDeAvisoPrevio("2023-01-10", "2026-06-20", "pedido_demissao")).toBe(0);
    expect(diasDeAvisoPrevio("2023-01-10", "2026-06-20", "acordo_mutuo")).toBe(20);
  });

  it("multa do FGTS varia por motivo", () => {
    expect(percentualMultaFgts("dispensa_sem_justa_causa")).toBe(0.4);
    expect(percentualMultaFgts("acordo_mutuo")).toBe(0.2);
    expect(percentualMultaFgts("pedido_demissao")).toBe(0);
  });

  it("férias proporcionais contam avos do período aquisitivo em curso", () => {
    expect(avosFeriasProporcionais("2023-01-10", "2026-06-20")).toBe(5);
    expect(avosFeriasProporcionais("2026-01-10", "2026-01-20")).toBe(0);
  });

  it("dispensa sem justa causa gera todas as verbas", () => {
    const r = verbasDaRescisao({ ...base, motivo: "dispensa_sem_justa_causa", saldoFgts: 5000 });
    const desc = r.map((x) => x.descricao);
    expect(desc[0]).toBe("Saldo de salário (20 dias)");
    expect(desc.some((d) => d.startsWith("Aviso prévio indenizado"))).toBe(true);
    expect(desc.some((d) => d.startsWith("13º proporcional"))).toBe(true);
    expect(desc.some((d) => d.startsWith("Férias proporcionais"))).toBe(true);
    expect(r.find((x) => x.descricao.startsWith("Multa"))?.valor).toBe(2000);
  });

  it("justa causa paga apenas saldo de salário", () => {
    const r = verbasDaRescisao({ ...base, motivo: "dispensa_com_justa_causa" });
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(2000);
  });

  it("pedido de demissão pode descontar o aviso não cumprido", () => {
    const r = verbasDaRescisao({ ...base, motivo: "pedido_demissao", descontarAvisoNaoCumprido: true });
    const aviso = r.find((x) => x.descricao === "Aviso prévio não cumprido");
    expect(aviso).toMatchObject({ natureza: "desconto", valor: 3000 });
  });

  it("férias vencidas somam o terço constitucional e não são tributáveis", () => {
    const r = verbasDaRescisao({ ...base, motivo: "pedido_demissao", diasFeriasVencidas: 30 });
    const vencidas = r.find((x) => x.descricao.startsWith("Férias vencidas"));
    const terco = r.find((x) => x.descricao === "1/3 sobre férias vencidas");
    expect(vencidas?.valor).toBe(3000);
    expect(terco?.valor).toBe(1000);
    expect(terco?.tributavel).toBe(false);
  });

  it("sem salário base não há verbas", () => {
    expect(verbasDaRescisao({ ...base, salarioBase: 0, motivo: "pedido_demissao" })).toEqual([]);
  });
});
