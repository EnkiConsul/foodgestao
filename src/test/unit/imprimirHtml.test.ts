import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FALHA_IMPRESSAO, imprimirHtmlEmQuadro } from "@/lib/print/imprimirHtml";

const erroToast = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => erroToast(m) } }));

const HTML_FIXTURE =
  `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Documento de teste</title></head>` +
  `<body><h1>RELATÓRIO FICTÍCIO</h1><table><tr><td>1.1</td><td>Conta de teste</td><td>0,00</td></tr></table></body></html>`;

let criados: string[] = [];
let revogados: string[] = [];

function quadro(): HTMLIFrameElement | null {
  return document.querySelector("iframe[title='Documento para impressão']");
}

beforeEach(() => {
  criados = [];
  revogados = [];
  erroToast.mockClear();
  document.body.innerHTML = "";
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:teste/${criados.length}`;
    criados.push(u);
    return u;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn((u: string) => {
    revogados.push(u);
  }) as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("imprimirHtmlEmQuadro — caminho de sucesso (solicitação iniciada)", () => {
  it("insere o quadro, chama imprimir e limpa uma única vez", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    const aoFalhar = vi.fn();

    const iniciada = imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar);
    expect(iniciada).toBe(true);

    const f = quadro();
    expect(f).not.toBeNull();
    Object.defineProperty(f!, "contentWindow", {
      value: { print, focus: vi.fn() },
      configurable: true,
    });
    f!.onload?.(new Event("load"));

    expect(print).toHaveBeenCalledTimes(1);
    expect(aoFalhar).not.toHaveBeenCalled();
    // quadro segue no DOM enquanto a caixa de impressão pode estar aberta
    expect(quadro()).not.toBeNull();

    vi.advanceTimersByTime(60_000);
    expect(quadro()).toBeNull();
    expect(revogados).toEqual(criados);

    // cleanup idempotente: nenhum tempo extra libera o endereço de novo
    vi.advanceTimersByTime(120_000);
    expect(revogados).toHaveLength(1);
  });
});

describe("imprimirHtmlEmQuadro — falhas detectáveis", () => {
  it("avisa quando o endereço temporário não pode ser criado", () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error("sem blob");
    }) as unknown as typeof URL.createObjectURL;
    const aoFalhar = vi.fn();

    expect(imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar)).toBe(false);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(quadro()).toBeNull();
  });

  it("avisa quando a inserção do quadro é bloqueada", () => {
    const original = document.body.appendChild.bind(document.body);
    const spy = vi.spyOn(document.body, "appendChild").mockImplementation(() => {
      throw new Error("append bloqueado");
    });
    const aoFalhar = vi.fn();

    expect(imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar)).toBe(false);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(revogados).toEqual(criados);

    spy.mockRestore();
    expect(typeof original).toBe("function");
  });

  it("avisa e limpa quando o quadro dispara erro de carregamento", () => {
    const aoFalhar = vi.fn();
    imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar);
    const f = quadro()!;
    f.onerror?.(new Event("error"));

    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(quadro()).toBeNull();
    expect(revogados).toEqual(criados);
  });

  it("avisa e limpa quando o carregamento demora demais", () => {
    vi.useFakeTimers();
    const aoFalhar = vi.fn();
    imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar);
    expect(quadro()).not.toBeNull();

    vi.advanceTimersByTime(10_000);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(quadro()).toBeNull();
    expect(revogados).toEqual(criados);
  });

  it("avisa quando o quadro carrega sem janela acessível", () => {
    const aoFalhar = vi.fn();
    imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar);
    const f = quadro()!;
    Object.defineProperty(f, "contentWindow", { value: null, configurable: true });
    f.onload?.(new Event("load"));

    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(quadro()).toBeNull();
  });

  it("avisa quando o navegador recusa a chamada de imprimir", () => {
    const aoFalhar = vi.fn();
    imprimirHtmlEmQuadro(HTML_FIXTURE, aoFalhar);
    const f = quadro()!;
    Object.defineProperty(f, "contentWindow", {
      value: {
        focus: vi.fn(),
        print: () => {
          throw new Error("impressão recusada");
        },
      },
      configurable: true,
    });
    f.onload?.(new Event("load"));

    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(quadro()).toBeNull();
    expect(revogados).toEqual(criados);
  });

  it("sem callback próprio, mostra aviso visível na tela", async () => {
    imprimirHtmlEmQuadro(HTML_FIXTURE);
    const f = quadro()!;
    Object.defineProperty(f, "contentWindow", { value: null, configurable: true });
    f.onload?.(new Event("load"));

    await vi.waitFor(() => expect(erroToast).toHaveBeenCalledWith(FALHA_IMPRESSAO));
  });
});
