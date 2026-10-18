import { describe, expect, it, vi } from "vitest";
import { carregarComPrazo, executarBlocosPendencias } from "../pendencias-carregamento";

describe("carregamento das pendências", () => {
  it("inicia consultas independentes juntas, com no máximo quatro em curso", async () => {
    let ativas = 0;
    let pico = 0;
    let concluidas = 0;
    const blocos = Array.from({ length: 9 }, () => async () => {
      ativas++;
      pico = Math.max(pico, ativas);
      await new Promise((resolve) => setTimeout(resolve, 1));
      ativas--;
      concluidas++;
    });
    await executarBlocosPendencias(blocos, new AbortController().signal);
    expect(pico).toBe(4);
    expect(concluidas).toBe(9);
  });

  it("encerra a espera e cancela consultas travadas", async () => {
    vi.useFakeTimers();
    let signalRecebido: AbortSignal | undefined;
    const resultado = carregarComPrazo((signal) => {
      signalRecebido = signal;
      return new Promise(() => {});
    }, new AbortController().signal);
    const verificacao = expect(resultado).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(30_000);
    await verificacao;
    expect(signalRecebido?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("propaga falhas sem retornar uma lista vazia de sucesso", async () => {
    await expect(carregarComPrazo(async () => { throw new Error("falha de rede"); }, new AbortController().signal)).rejects.toThrow("falha de rede");
  });
});