import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const warning = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/billing/excedente-colaboradores", () => ({ garantirColaboradorNovo: vi.fn() }));
vi.mock("sonner", () => ({ toast: { warning, error: vi.fn() } }));
vi.mock("@/lib/errorLog", () => ({ reportError }));
import { atualizarMeuCadastro } from "@/lib/dp/colaborador-oficial";
import { ehRegraNegada } from "@/lib/dp/regraAviso";
import { notifyError } from "@/lib/notifyError";

describe("validação de pagamento no portal", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ["PIX_TIPO_NAO_PERMITIDO", "A chave Pix aceita é CPF ou celular do próprio colaborador."],
    ["PIX_CHAVE_OBRIGATORIA", "Informe a chave Pix."],
    ["PIX_CHAVE_INVALIDA", "A chave Pix informada não confere com o tipo escolhido."],
    ["TITULAR_TERCEIRO_NAO_PERMITIDO", "O pagamento só pode ser feito em chave Pix ou conta do próprio colaborador."],
  ])("%s é orientação sem auditoria", async (code, mensagem) => {
    rpc.mockResolvedValue({ error: { code: "P0001", message: code } });
    await expect(atualizarMeuCadastro({})).rejects.toMatchObject({ name: "RegraNegada", message: mensagem });
    try { await atualizarMeuCadastro({}); } catch (e) {
      notifyError(e, { surface: "Meu perfil", action: "salvar dados", fallback: "Falha" });
    }
    expect(warning).toHaveBeenCalledWith(mensagem, expect.anything());
    expect(reportError).not.toHaveBeenCalled();
  });
  it("mantém falha real mesmo que o texto mencione Pix", async () => {
    const erro = { code: "PGRST202", message: "Failed to fetch Pix service" };
    rpc.mockResolvedValue({ error: erro });
    await expect(atualizarMeuCadastro({})).rejects.toBe(erro);
    expect(ehRegraNegada(erro)).toBe(false);
  });
});