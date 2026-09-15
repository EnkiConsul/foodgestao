import { describe, it, expect } from "vitest";
import { resolveScopedPluggyAccount } from "@/lib/pluggy/scopedPluggyAccount";

const row = (
  id: string,
  connection: string,
  status: string | null,
  extra: Record<string, unknown> = {},
) => ({
  pluggy_account_id: id,
  connection_id: connection,
  name: "Conta",
  number_masked: null,
  pluggy_connections: status === null ? null : { id: connection, status },
  ...extra,
});

describe("resolveScopedPluggyAccount", () => {
  it("1 conexão ativa + 2 encerradas devolve o vínculo ativo", () => {
    // Caso real do Praianos (conta final 7943).
    const r = resolveScopedPluggyAccount({
      rows: [
        row("f242aac5", "a4ca50e4", "updated"),
        row("3fab171a", "766357e8", "deleted"),
        row("31f0d2e9", "9f1bdb88", "deleted"),
      ],
    });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") {
      expect(r.account.pluggyAccountId).toBe("f242aac5");
      expect(r.account.connectionId).toBe("a4ca50e4");
    }
  });

  it("somente conexões encerradas não amplia o escopo", () => {
    const r = resolveScopedPluggyAccount({
      rows: [row("a", "c1", "deleted"), row("b", "c2", "revoked")],
    });
    expect(r.status).toBe("inactive_only");
  });

  it("erro de consulta não vira conta sem vínculo", () => {
    const r = resolveScopedPluggyAccount({
      rows: null,
      error: { message: "JSON object requested, multiple rows returned" },
    });
    expect(r.status).toBe("error");
  });

  it("conta de outra empresa não resolve (nenhuma linha no escopo)", () => {
    const r = resolveScopedPluggyAccount({ rows: [] });
    expect(r.status).toBe("not_linked");
  });

  it("duas conexões ativas é ambiguidade explícita, sem escolher uma", () => {
    const r = resolveScopedPluggyAccount({
      rows: [row("a", "c1", "updated"), row("b", "c2", "outdated")],
    });
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidates).toHaveLength(2);
  });

  it("status ausente não é tratado como encerrado", () => {
    const r = resolveScopedPluggyAccount({ rows: [row("a", "c1", null)] });
    expect(r.status).toBe("resolved");
  });

  it("linha sem connection_id é ignorada", () => {
    const r = resolveScopedPluggyAccount({
      rows: [{ pluggy_account_id: "a", connection_id: null }],
    });
    expect(r.status).toBe("not_linked");
  });

  it("embed em array também é lido", () => {
    const r = resolveScopedPluggyAccount({
      rows: [
        { pluggy_account_id: "a", connection_id: "c1", pluggy_connections: [{ id: "c1", status: "deleted" }] },
        { pluggy_account_id: "b", connection_id: "c2", pluggy_connections: [{ id: "c2", status: "updated" }] },
      ],
    });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.account.pluggyAccountId).toBe("b");
  });
});
