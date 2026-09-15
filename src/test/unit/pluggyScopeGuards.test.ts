import { describe, it, expect, vi } from "vitest";
import { aggregateSyncFeedback, canSyncScopedTargets, describeSyncOutcome } from "@/lib/pluggy/syncOutcome";
import { resolveScopedPluggyAccount } from "@/lib/pluggy/scopedPluggyAccount";

describe("canSyncScopedTargets", () => {
  const base = { scopeRequested: true, scopeResolved: false, scopeUnresolved: true, loading: false, targetCount: 0 };

  it("escopo carregando bloqueia a sincronização", () => {
    expect(canSyncScopedTargets({ ...base, loading: true })).toEqual({ allowed: false, reason: "loading" });
  });

  it("escopo pedido e não resolvido bloqueia (nunca empresa inteira)", () => {
    expect(canSyncScopedTargets({ ...base, targetCount: 3 })).toEqual({
      allowed: false,
      reason: "unresolved",
    });
  });

  it("escopo resolvido com um alvo libera", () => {
    expect(
      canSyncScopedTargets({ ...base, scopeResolved: true, scopeUnresolved: false, targetCount: 1 }),
    ).toEqual({ allowed: true });
  });

  it("sem escopo pedido e sem alvos não sincroniza", () => {
    expect(canSyncScopedTargets({ ...base, scopeRequested: false, scopeUnresolved: false })).toEqual({
      allowed: false,
      reason: "no_targets",
    });
  });
});

describe("aggregateSyncFeedback", () => {
  const fb = (level: "success" | "warning" | "info" | "error") => ({
    level,
    title: level,
    suggestReconnect: false,
  });

  it("um erro derruba o lote", () => {
    expect(aggregateSyncFeedback([fb("success"), fb("error")])).toBe("error");
  });
  it("um parcial impede sucesso global", () => {
    expect(aggregateSyncFeedback([fb("success"), fb("warning")])).toBe("warning");
  });
  it("um pendente impede sucesso global", () => {
    expect(aggregateSyncFeedback([fb("success"), fb("info")])).toBe("info");
  });
  it("todos concluídos é sucesso", () => {
    expect(aggregateSyncFeedback([fb("success"), fb("success")])).toBe("success");
  });
  it("sem alvos não há mensagem", () => {
    expect(aggregateSyncFeedback([])).toBeNull();
  });
});

/** Reproduz o handler: escopo bloqueado não deve chamar a Edge Function. */
async function syncNowSimulado(opts: {
  scopeRequested: boolean;
  scopeResolved: boolean;
  loading: boolean;
  targets: string[];
  invoke: (id: string) => Promise<{ transportError?: boolean; body: unknown }>;
}) {
  const guard = canSyncScopedTargets({
    scopeRequested: opts.scopeRequested,
    scopeResolved: opts.scopeResolved,
    scopeUnresolved: opts.scopeRequested && !opts.scopeResolved,
    loading: opts.loading,
    targetCount: opts.targets.length,
  });
  if (!guard.allowed) return { blocked: guard.reason, level: null };
  const feedbacks = [];
  for (const id of opts.targets) {
    const r = await opts.invoke(id);
    feedbacks.push(describeSyncOutcome({ transportError: r.transportError, body: r.body as never }));
  }
  return { blocked: null, level: aggregateSyncFeedback(feedbacks) };
}

describe("syncNow com escopo", () => {
  it("escopo bloqueado não invoca a sincronização", async () => {
    const invoke = vi.fn();
    const r = await syncNowSimulado({
      scopeRequested: true,
      scopeResolved: false,
      loading: false,
      targets: ["conn-1", "conn-2", "conn-3"],
      invoke,
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(r.blocked).toBe("unresolved");
  });

  it("escopo resolvido invoca somente a conexão do escopo e não anuncia sucesso em parcial", async () => {
    const invoke = vi.fn(async () => ({
      body: { ok: true, item_status: "UPDATED", execution_status: "PARTIAL_SUCCESS", transactions: 3 },
    }));
    const r = await syncNowSimulado({
      scopeRequested: true,
      scopeResolved: true,
      loading: false,
      targets: ["conn-escopo"],
      invoke,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("conn-escopo");
    expect(r.level).toBe("warning");
  });
});

/**
 * Resposta atrasada: a consulta da seleção A termina depois da seleção B e não
 * pode ser aplicada.
 */
describe("descarte de resposta atrasada por chave", () => {
  it("resultado de A que chega depois de B é ignorado", async () => {
    let current = "empresa-1|acc:A";
    const aplicado: string[] = [];

    const carregar = async (key: string, atraso: number, rows: unknown[]) => {
      current = key;
      const meuKey = key;
      await new Promise((r) => setTimeout(r, atraso));
      if (current !== meuKey) return; // resposta antiga: descartada
      const resolution = resolveScopedPluggyAccount({
        companyId: "empresa-1",
        rows: rows as never,
        error: undefined,
      });
      aplicado.push(`${meuKey}:${resolution.status === "resolved" ? resolution.account.pluggyAccountId : resolution.status}`);
    };

    const lenta = carregar("empresa-1|acc:A", 40, [
      {
        pluggy_account_id: "pa-A",
        connection_id: "c-A",
        company_id: "empresa-1",
        pluggy_connections: { id: "c-A", status: "updated", company_id: "empresa-1" },
      },
    ]);
    const rapida = carregar("empresa-1|acc:B", 5, [
      {
        pluggy_account_id: "pa-B",
        connection_id: "c-B",
        company_id: "empresa-1",
        pluggy_connections: { id: "c-B", status: "updated", company_id: "empresa-1" },
      },
    ]);
    await Promise.all([lenta, rapida]);

    expect(aplicado).toEqual(["empresa-1|acc:B:pa-B"]);
    expect(current).toBe("empresa-1|acc:B");
  });
});
