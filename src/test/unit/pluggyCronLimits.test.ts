import { describe, it, expect } from "vitest";
import { resolveCronLimits, createdByOnInsert } from "../../../supabase/functions/_shared/pluggy-cron-limits";

const env = (m: Record<string, string>) => (k: string) => m[k];

describe("limites do cron Pluggy", () => {
  it("usa os padrões 12, 6, 50000, 20000", () => {
    expect(resolveCronLimits(env({}))).toEqual({
      batchSize: 12, parallelism: 6, itemTimeoutMs: 50000, syncWaitMs: 20000, reduced: false,
    });
  });
  it("reduz o lote quando o pior caso passa de 120s", () => {
    const l = resolveCronLimits(env({ PLUGGY_CRON_BATCH_SIZE: "30" }));
    expect(l.reduced).toBe(true);
    expect(l.batchSize).toBe(12);
    expect(Math.ceil(l.batchSize / l.parallelism) * l.itemTimeoutMs).toBeLessThanOrEqual(120000);
  });
  it("ignora valores inválidos", () => {
    expect(resolveCronLimits(env({ PLUGGY_CRON_PARALLELISM: "abc" })).parallelism).toBe(6);
  });
});

describe("created_by na criação da conexão", () => {
  it("usa o usuário quando existe", () => expect(createdByOnInsert(false, "u1", "dono")).toBe("u1"));
  it("sem usuário usa o dono da empresa", () => expect(createdByOnInsert(false, null, "dono")).toBe("dono"));
  it("nunca grava em conexão existente", () => expect(createdByOnInsert(true, "u1", "dono")).toBeNull());
});
