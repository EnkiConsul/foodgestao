import { describe, expect, it } from "vitest";
import { pendenciasAbertas, type EventoConta } from "./pendenciasCompensacao";

const ev = (id: string, tipo: string, created_at: string, payload: any): EventoConta => ({
  id, tipo_evento: tipo, created_at, billing_account_id: "acc", payload,
});

describe("pendências de compensação no Backoffice", () => {
  it("resolução antiga da mesma assinatura não esconde alerta novo", () => {
    const r = pendenciasAbertas([
      ev("p1", "compensacao_pendente", "2026-10-01T10:00:00Z", { subscription_id: "s1" }),
      ev("r1", "compensacao_resolvida", "2026-10-02T10:00:00Z", { subscription_id: "s1" }),
      ev("p2", "compensacao_pendente", "2026-11-05T10:00:00Z", { subscription_id: "s1" }),
    ]);
    expect(r.desfazUpgrade.map((e) => e.id)).toEqual(["p2"]);
  });

  it("resolução com id encerra só a pendência indicada", () => {
    const r = pendenciasAbertas([
      ev("p1", "compensacao_pendente", "2026-11-01T10:00:00Z", { subscription_id: "s1" }),
      ev("p2", "compensacao_pendente", "2026-11-02T10:00:00Z", { subscription_id: "s1" }),
      ev("r1", "compensacao_resolvida", "2026-11-03T10:00:00Z", { subscription_id: "s1", evento_pendente_id: "p1" }),
    ]);
    expect(r.desfazUpgrade.map((e) => e.id)).toEqual(["p2"]);
  });

  it("resolução de outra assinatura não encerra a pendência", () => {
    const r = pendenciasAbertas([
      ev("p1", "contratacao_falhou_compensacao_pendente", "2026-11-01T10:00:00Z", { subscription_id: "s1" }),
      ev("r1", "compensacao_resolvida", "2026-11-03T10:00:00Z", { subscription_id: "s2" }),
    ]);
    expect(r.compensacoes.map((e) => e.id)).toEqual(["p1"]);
  });

  it("desfazimento incompleto só é encerrado por desfazimento_resolvido posterior", () => {
    const r = pendenciasAbertas([
      ev("p1", "desfazimento_incompleto", "2026-11-01T10:00:00Z", { subscription_id: "s1" }),
      ev("r0", "compensacao_resolvida", "2026-11-02T10:00:00Z", { subscription_id: "s1" }),
    ]);
    expect(r.incompletos.map((e) => e.id)).toEqual(["p1"]);
    const r2 = pendenciasAbertas([
      ev("p1", "desfazimento_incompleto", "2026-11-01T10:00:00Z", { subscription_id: "s1" }),
      ev("r1", "desfazimento_resolvido", "2026-11-02T10:00:00Z", { subscription_id: "s1" }),
    ]);
    expect(r2.incompletos).toEqual([]);
  });
});
