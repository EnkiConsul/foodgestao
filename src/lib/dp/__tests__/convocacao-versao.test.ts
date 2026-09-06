import { describe, expect, it, vi } from "vitest";
import { comCarimboAtual, ehConflitoDeVersao } from "@/lib/dp/convocacao-versao";

describe("convocacao-versao", () => {
  it("reconhece conflito por código e por mensagem", () => {
    expect(ehConflitoDeVersao({ code: "40001" })).toBe(true);
    expect(ehConflitoDeVersao({ message: "CONCURRENT_MODIFICATION: ..." })).toBe(true);
    expect(ehConflitoDeVersao({ code: "22023", message: "INVALID_INPUT" })).toBe(false);
  });

  it("usa o carimbo relido do banco", async () => {
    const ler = vi.fn().mockResolvedValue("v2");
    const acao = vi.fn().mockResolvedValue("ok");
    await expect(comCarimboAtual(ler, acao)).resolves.toBe("ok");
    expect(acao).toHaveBeenCalledWith("v2");
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("tenta uma única vez mais em conflito de versão", async () => {
    const ler = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    const acao = vi
      .fn()
      .mockRejectedValueOnce({ code: "40001", message: "CONCURRENT_MODIFICATION" })
      .mockResolvedValueOnce("ok");
    await expect(comCarimboAtual(ler, acao)).resolves.toBe("ok");
    expect(acao).toHaveBeenNthCalledWith(1, "v1");
    expect(acao).toHaveBeenNthCalledWith(2, "v2");
  });

  it("propaga o erro quando o conflito persiste", async () => {
    const ler = vi.fn().mockResolvedValue("v1");
    const acao = vi.fn().mockRejectedValue({ code: "40001", message: "CONCURRENT_MODIFICATION" });
    await expect(comCarimboAtual(ler, acao)).rejects.toMatchObject({ code: "40001" });
    expect(acao).toHaveBeenCalledTimes(2);
  });

  it("não repete em erro que não é de versão", async () => {
    const ler = vi.fn().mockResolvedValue("v1");
    const acao = vi.fn().mockRejectedValue({ code: "22023", message: "INVALID_INPUT" });
    await expect(comCarimboAtual(ler, acao)).rejects.toMatchObject({ code: "22023" });
    expect(acao).toHaveBeenCalledTimes(1);
  });
});
