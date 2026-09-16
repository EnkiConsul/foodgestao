import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const recover = vi.fn(async () => true);
let jaTentou = false;

vi.mock("@/lib/staleBundle", () => ({
  recoverFromStaleBundle: (...args: unknown[]) => recover(...(args as [])),
  staleReloadAlreadyTried: () => jaTentou,
  isStaleBundleError: () => true,
}));

import { lazyWithRetry } from "@/lib/lazyWithRetry";

/** Executa a fábrica interna do componente lazy sem renderizar React. */
async function carregar(lazyComp: unknown) {
  const payload = (lazyComp as { _payload: { _result: () => Promise<unknown> } })._payload;
  return payload._result();
}

describe("lazyWithRetry", () => {
  beforeEach(() => {
    recover.mockClear();
    jaTentou = false;
  });
  afterEach(() => vi.restoreAllMocks());

  it("aceita sucesso na segunda tentativa, sem recarregar", async () => {
    const Comp = () => null;
    let chamadas = 0;
    const factory = vi.fn(async () => {
      chamadas += 1;
      if (chamadas === 1) throw new Error("Failed to fetch dynamically imported module");
      return { default: Comp };
    });

    const mod = (await carregar(lazyWithRetry(factory))) as { default: unknown };
    expect(mod.default).toBe(Comp);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(recover).not.toHaveBeenCalled();
  });

  it("limpa cache e recarrega quando as duas tentativas falham", async () => {
    const factory = vi.fn(async () => {
      throw new Error("Failed to fetch dynamically imported module");
    });

    const pendente = carregar(lazyWithRetry(factory));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenCalledTimes(1);
    // Promise pendente mantém o Suspense ativo durante o recarregamento.
    let resolvida = false;
    void pendente.then(() => {
      resolvida = true;
    });
    await Promise.resolve();
    expect(resolvida).toBe(false);
  });

  it("não recarrega em laço quando a sessão já tentou recuperar", async () => {
    jaTentou = true;
    const factory = vi.fn(async () => {
      throw new Error("Failed to fetch dynamically imported module");
    });

    await expect(carregar(lazyWithRetry(factory))).rejects.toThrow(/Failed to fetch/);
    expect(recover).not.toHaveBeenCalled();
  });
});
