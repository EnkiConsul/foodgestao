import { describe, expect, it, vi, beforeEach } from "vitest";

const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/errorLog", () => ({ reportError: reportErrorMock }));

import { notifyError } from "@/lib/notifyError";
import { negarRegra, RegraNegada, ehRegraNegada } from "@/lib/dp/regraAviso";
import { podeMarcarNormal, mensagemJanela, type JanelaResolvida } from "@/lib/dp/folga-janela";

function janela(estado: JanelaResolvida["estado"]): JanelaResolvida {
  const competencia = new Date(2026, 9, 1);
  return {
    estado,
    competencia,
    competenciaKey: "2026-10",
    abreEm: new Date(2026, 8, 20),
    fechaEm: new Date(2026, 8, 27),
  } as JanelaResolvida;
}

describe("regraAviso", () => {
  beforeEach(() => {
    toastMock.error.mockClear();
    toastMock.warning.mockClear();
    reportErrorMock.mockClear();
  });

  it("negarRegra lança RegraNegada reconhecível", () => {
    expect(() => negarRegra("Limite atingido.")).toThrow(RegraNegada);
    expect(ehRegraNegada(new RegraNegada("x"))).toBe(true);
    expect(ehRegraNegada(new Error("x"))).toBe(false);
  });

  it("aviso de regra mostra a frase da regra e não registra na auditoria", () => {
    notifyError(new RegraNegada("Data indisponível. Limite de folgas atingido."), {
      surface: "Meu calendário",
      action: "concluir a ação",
      fallback: "Erro ao marcar folga",
    });
    expect(toastMock.warning).toHaveBeenCalledWith(
      "Data indisponível. Limite de folgas atingido.",
      expect.anything(),
    );
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("erro comum continua registrando com texto amigável", () => {
    notifyError(new Error('record new has no field "x"'), {
      surface: "Meu calendário",
      action: "concluir a ação",
      fallback: "Erro ao marcar folga",
    });
    expect(toastMock.error).toHaveBeenCalledWith("Erro ao marcar folga", expect.anything());
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });
});

describe("período de escolha das folgas", () => {
  const dataAlvo = new Date(2026, 9, 10); // outubro
  const outroMes = new Date(2026, 10, 7); // novembro

  it("antes da abertura a marcação direta é bloqueada", () => {
    expect(podeMarcarNormal(janela("antes"), dataAlvo)).toBe(false);
  });

  it("com o período aberto vale o mês-alvo", () => {
    expect(podeMarcarNormal(janela("aberta"), dataAlvo)).toBe(true);
    expect(podeMarcarNormal(janela("aberta"), outroMes)).toBe(false);
  });

  it("com o período encerrado a marcação direta segue liberada", () => {
    expect(podeMarcarNormal(janela("encerrada"), dataAlvo)).toBe(true);
    expect(podeMarcarNormal(janela("encerrada"), outroMes)).toBe(true);
  });

  it("mensagem do período encerrado cita marcar, trocar e exceção", () => {
    const texto = mensagemJanela(janela("encerrada"), (d) => d.toLocaleDateString("pt-BR"));
    expect(texto).toContain("marcar ou mudar folgas");
    expect(texto).toContain("troca");
    expect(texto).toContain("exceção");
  });
});
