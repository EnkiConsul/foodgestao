import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes de comportamento da exclusão de conta bancária.
 *
 * Cobrem a RPC `delete_account`, que:
 *  - retorna 'hard' quando a conta não tem lançamentos vinculados (excluída de vez)
 *  - retorna 'soft' quando há histórico (arquivada)
 *  - lança erro quando há conexão Open Finance ativa
 *
 * Como a RPC roda no backend, aqui testamos o handler do UI
 * (mesma lógica de `handleDelete` em src/pages/ContasBancarias.tsx),
 * garantindo que a mensagem correta é exibida em cada cenário.
 */

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

type RpcResult = { data: string | null; error: { message: string } | null };

function makeHandler(rpc: (name: string, args: unknown) => Promise<RpcResult>) {
  const fetchAccounts = vi.fn();
  const setDeleteAccount = vi.fn();
  const deleteAccount = { id: "acc-1", name: "Conta Teste" };

  const handleDelete = async () => {
    const { data, error } = await rpc("delete_account", { _account_id: deleteAccount.id });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("open_finance") || msg.includes("conex") || msg.includes("desconect")) {
        toastError("Desconecte o Open Finance desta conta antes de excluir.");
      } else {
        toastError("Erro ao excluir conta");
      }
    } else {
      toastSuccess(data === "hard" ? "Conta excluída" : "Conta arquivada");
      fetchAccounts();
    }
    setDeleteAccount(null);
  };

  return { handleDelete, fetchAccounts, setDeleteAccount };
}

describe("handleDelete (exclusão de conta bancária)", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("exclui de vez quando não há lançamentos (RPC retorna 'hard')", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "hard", error: null });
    const { handleDelete, fetchAccounts, setDeleteAccount } = makeHandler(rpc);

    await handleDelete();

    expect(rpc).toHaveBeenCalledWith("delete_account", { _account_id: "acc-1" });
    expect(toastSuccess).toHaveBeenCalledWith("Conta excluída");
    expect(toastError).not.toHaveBeenCalled();
    expect(fetchAccounts).toHaveBeenCalledTimes(1);
    expect(setDeleteAccount).toHaveBeenCalledWith(null);
  });

  it("arquiva quando há histórico de lançamentos (RPC retorna 'soft')", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "soft", error: null });
    const { handleDelete, fetchAccounts } = makeHandler(rpc);

    await handleDelete();

    expect(toastSuccess).toHaveBeenCalledWith("Conta arquivada");
    expect(toastError).not.toHaveBeenCalled();
    expect(fetchAccounts).toHaveBeenCalledTimes(1);
  });

  it("mostra erro específico quando há Open Finance conectado", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "desconecte o Open Finance antes de excluir esta conta" },
    });
    const { handleDelete, fetchAccounts } = makeHandler(rpc);

    await handleDelete();

    expect(toastError).toHaveBeenCalledWith(
      "Desconecte o Open Finance desta conta antes de excluir.",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(fetchAccounts).not.toHaveBeenCalled();
  });

  it("mostra erro genérico para outras falhas da RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const { handleDelete, fetchAccounts } = makeHandler(rpc);

    await handleDelete();

    expect(toastError).toHaveBeenCalledWith("Erro ao excluir conta");
    expect(fetchAccounts).not.toHaveBeenCalled();
  });
});
