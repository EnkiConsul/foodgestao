import { describe, expect, it, vi } from "vitest";
import { efetivacaoDisponivel, finalizarDepoisDeSalvar, inicioJornadaAdmissao, salvarAntesDeAvancar } from "../admissao-fluxo";

describe("fluxo de admissão", () => {
  it("não avança quando o salvamento falha", async () => {
    const avancar = vi.fn();
    await expect(salvarAntesDeAvancar(async () => { throw new Error("falha"); }, avancar)).rejects.toThrow("falha");
    expect(avancar).not.toHaveBeenCalled();
  });
  it("aguarda a gravação antes de avançar", async () => {
    const ordem: string[] = [];
    await salvarAntesDeAvancar(async () => { await Promise.resolve(); ordem.push("salvo"); }, () => ordem.push("avançou"));
    expect(ordem).toEqual(["salvo", "avançou"]);
  });
  it.each(["clt", "intermitente"])("exige ASO e retorno conferido para %s", (regime) => {
    expect(efetivacaoDisponivel(regime, "pronto_contabilidade", true, true)).toBe(false);
    expect(efetivacaoDisponivel(regime, "registro_recebido", false, true)).toBe(false);
    expect(efetivacaoDisponivel(regime, "registro_recebido", true, false)).toBe(false);
    expect(efetivacaoDisponivel(regime, "registro_recebido", true, true)).toBe(true);
  });
  it.each(["freelancer", "pj", "mei"])("oferece efetivação direta depois de conferir %s", (regime) => {
    expect(efetivacaoDisponivel(regime, "aguardando_revisao", false, false)).toBe(false);
    expect(efetivacaoDisponivel(regime, "pronto_contabilidade", false, false)).toBe(true);
  });
  it("usa o início na loja, sem assumir hoje", () => {
    expect(inicioJornadaAdmissao("2026-10-12", "2026-10-24")).toBe("2026-10-12");
    expect(inicioJornadaAdmissao(null, "2026-10-12")).toBe("2026-10-12");
    expect(inicioJornadaAdmissao()).toBe("");
  });
  it.each(["clt", "intermitente"])("permite %s sem retorno da ficha somente após ASO e envio confirmado", (regime) => {
    expect(efetivacaoDisponivel(regime, "enviado_contabilidade", true, false, true)).toBe(true);
    expect(efetivacaoDisponivel(regime, "aguardando_retorno_contabilidade", true, false, true)).toBe(true);
    expect(efetivacaoDisponivel(regime, "pronto_contabilidade", true, false, true)).toBe(false);
    expect(efetivacaoDisponivel(regime, "enviado_contabilidade", false, false, true)).toBe(false);
    expect(efetivacaoDisponivel(regime, "enviado_contabilidade", true, false)).toBe(false);
  });
  it("trata falha de finalização separadamente da gravação concluída", async () => {
    const erro = new Error("documento obrigatório pendente");
    const avisar = vi.fn();
    await expect(finalizarDepoisDeSalvar(async () => { throw erro; }, avisar)).resolves.toBeUndefined();
    expect(avisar).toHaveBeenCalledWith(erro);
  });
});