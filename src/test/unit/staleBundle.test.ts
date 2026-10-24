import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { recoverFromStaleBundle, staleReloadAlreadyTried } from "@/lib/staleBundle";

describe("recuperação de versão sem laço", () => {
  const reload = vi.fn();
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T13:14:00Z"));
    vi.stubGlobal("window", { location: { reload } });
    reload.mockClear();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("permite uma tentativa automática e bloqueia nova recarga por 30 segundos", async () => {
    expect(await recoverFromStaleBundle()).toBe(true);
    expect(await recoverFromStaleBundle()).toBe(false);
    vi.advanceTimersByTime(29_999);
    expect(staleReloadAlreadyTried()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(await recoverFromStaleBundle()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it("sem sessionStorage disponível só permite atualização manual", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(await recoverFromStaleBundle()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(await recoverFromStaleBundle(true)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});