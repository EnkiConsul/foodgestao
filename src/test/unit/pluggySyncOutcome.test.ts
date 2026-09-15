import { describe, it, expect } from "vitest";
import { describeSyncOutcome } from "@/lib/pluggy/syncOutcome";

const ok = (extra: Record<string, unknown>) => ({ body: { ok: true, ...extra } });

describe("describeSyncOutcome", () => {
  it("só declara sucesso com UPDATED + SUCCESS", () => {
    const f = describeSyncOutcome(ok({ item_status: "UPDATED", execution_status: "SUCCESS", transactions: 12 }));
    expect(f.level).toBe("success");
    expect(f.title).toContain("12");
  });

  it("item UPDATING com ok:true não é sucesso", () => {
    const f = describeSyncOutcome(ok({ item_status: "UPDATING", execution_status: "UPDATING" }));
    expect(f.level).toBe("info");
    expect(f.title).toMatch(/atualizando/i);
    expect(f.suggestReconnect).toBe(false);
  });

  it("WAITING_USER_INPUT pede confirmação, não erro", () => {
    const f = describeSyncOutcome(ok({ item_status: "WAITING_USER_INPUT", execution_status: "WAITING_USER_INPUT" }));
    expect(f.level).toBe("info");
    expect(f.title).toMatch(/confirma/i);
  });

  it("PARTIAL_SUCCESS é aviso", () => {
    const f = describeSyncOutcome(ok({ item_status: "UPDATED", execution_status: "PARTIAL_SUCCESS", transactions: 3 }));
    expect(f.level).toBe("warning");
    expect(f.title).toBe("Parte dos dados não foi atualizada");
  });

  it("execução com erro não é sucesso", () => {
    const f = describeSyncOutcome(ok({ item_status: "ERROR", execution_status: "ERROR" }));
    expect(f.level).toBe("error");
    expect(f.suggestReconnect).toBe(false);
  });

  it("LOGIN_ERROR sugere reconectar", () => {
    const f = describeSyncOutcome(ok({ item_status: "LOGIN_ERROR", execution_status: "LOGIN_ERROR" }));
    expect(f.level).toBe("error");
    expect(f.suggestReconnect).toBe(true);
    expect(f.description).toMatch(/Reconectar/);
  });

  it("falha de transporte comum não recomenda reconectar", () => {
    const f = describeSyncOutcome({ transportError: true, body: null });
    expect(f.level).toBe("error");
    expect(f.suggestReconnect).toBe(false);
  });

  it("erro no corpo é erro", () => {
    const f = describeSyncOutcome({ body: { error: "sync_failed" } });
    expect(f.level).toBe("error");
  });

  it("pending é informativo", () => {
    const f = describeSyncOutcome({ body: { pending: true } });
    expect(f.level).toBe("info");
  });

  it("skipped por conexão revogada orienta reconectar", () => {
    const f = describeSyncOutcome({ body: { ok: true, skipped: "connection_revoked" } });
    expect(f.level).toBe("info");
    expect(f.suggestReconnect).toBe(true);
  });

  it("status desconhecido não afirma conclusão", () => {
    const f = describeSyncOutcome(ok({ item_status: "MERGED", execution_status: null }));
    expect(f.level).toBe("info");
    expect(f.title).not.toMatch(/concluída/i);
  });

  it("OUTDATED não sugere reconectar", () => {
    const f = describeSyncOutcome(ok({ item_status: "OUTDATED", execution_status: "SITE_NOT_AVAILABLE" }));
    expect(f.level).toBe("error");
    expect(f.suggestReconnect).toBe(false);
  });

  it.each(["ALREADY_LOGGED_IN", "ACCOUNT_LOCKED", "CONNECTION_ERROR", "SITE_NOT_AVAILABLE"])(
    "%s é erro com nova tentativa, sem reconexão",
    (execution_status) => {
      const f = describeSyncOutcome(ok({ item_status: "OUTDATED", execution_status }));
      expect(f.level).toBe("error");
      expect(f.suggestReconnect).toBe(false);
    },
  );

  it("USER_AUTHORIZATION_PENDING instrui concluir a confirmação existente", () => {
    const f = describeSyncOutcome(ok({ item_status: "UPDATING", execution_status: "USER_AUTHORIZATION_PENDING" }));
    expect(f.level).toBe("info");
    expect(f.suggestReconnect).toBe(false);
    expect(f.description).toMatch(/já está aberta/i);
  });

  it.each(["USER_AUTHORIZATION_REVOKED", "USER_AUTHORIZATION_NOT_GRANTED", "INVALID_CREDENTIALS"])(
    "%s sugere reconectar",
    (execution_status) => {
      const f = describeSyncOutcome(ok({ item_status: "LOGIN_ERROR", execution_status }));
      expect(f.level).toBe("error");
      expect(f.suggestReconnect).toBe(true);
    },
  );
});
