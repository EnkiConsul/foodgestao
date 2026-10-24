import { describe, expect, it } from "vitest";
import { lancarErroSolicitacao, mensagemRegraServidor } from "@/lib/dp/regraServidor";
import { RegraNegada } from "@/lib/dp/regraAviso";

describe("recusas de folga e troca", () => {
  it.each(["TROCA_DIAS_IGUAIS", "FOLGA_REGRA_NOVA", "INVALID_INPUT"])("preserva a orientação de %s sem token técnico", (token) => {
    expect(mensagemRegraServidor({ message: `${token}: Escolha dois dias diferentes para a troca.` })).toBe("Escolha dois dias diferentes para a troca.");
    expect(() => lancarErroSolicitacao({ message: `${token}: Escolha dois dias diferentes para a troca.` })).toThrow(RegraNegada);
  });
  it("não transforma indisponibilidade ou SQL em aviso de regra", () => {
    const erro = { code: "PGRST202", message: "Could not find function dp_FOLGA_REGRA" };
    expect(mensagemRegraServidor(erro)).toBeNull();
    try { lancarErroSolicitacao(erro); } catch (e) { expect(e).toBe(erro); }
    expect(mensagemRegraServidor({ message: "Failed to fetch" })).toBeNull();
  });
  it("não expõe detalhes SQL de uma recusa", () => {
    expect(mensagemRegraServidor({ message: "INVALID_INPUT: select * from private" })).toBe("Confira os dias e os dados informados antes de enviar o pedido.");
  });
});