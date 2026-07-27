import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AdjustAccountBalanceDialog } from "@/components/accounts/AdjustAccountBalanceDialog";

// --- Mocks -----------------------------------------------------------------
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

// randomUUID determinístico
Object.defineProperty(globalThis.crypto ?? {}, "randomUUID", {
  value: () => "idem-test-uuid",
  configurable: true,
});

const baseAccount = {
  id: "acc-1",
  name: "Conta Teste",
  current_balance: 100,
} as unknown as import("@/integrations/supabase/types").Database["public"]["Tables"]["accounts"]["Row"];

function open(props: Partial<Parameters<typeof AdjustAccountBalanceDialog>[0]> = {}) {
  return render(
    <AdjustAccountBalanceDialog
      open
      onOpenChange={() => {}}
      account={baseAccount}
      onAdjusted={() => {}}
      {...props}
    />,
  );
}

describe("AdjustAccountBalanceDialog", () => {
  beforeEach(() => {
    rpc.mockReset();
    toastSuccess.mockClear();
    toastError.mockClear();
    cleanup();
  });

  it("exibe o saldo atual formatado e o nome da conta", () => {
    open();
    expect(screen.getByText(/Conta:\s*Conta Teste/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*100,00/)).toBeInTheDocument();
  });

  it("botão Confirmar fica desabilitado enquanto justificativa estiver vazia", () => {
    open();
    const btn = screen.getByRole("button", { name: /confirmar ajuste/i });
    expect(btn).toBeDisabled();
  });

  it("bloqueia envio quando o saldo alvo é igual ao atual (delta zero)", () => {
    open();
    // justificativa preenchida mas alvo == atual
    fireEvent.change(screen.getByLabelText(/justificativa/i), { target: { value: "teste" } });
    const btn = screen.getByRole("button", { name: /confirmar ajuste/i });
    expect(btn).toBeDisabled();
  });

  it("chama adjust_account_balance com args corretos no submit bem-sucedido", async () => {
    rpc.mockResolvedValueOnce({ data: "tx-1", error: null });
    const onAdjusted = vi.fn();
    const onOpenChange = vi.fn();
    open({ onAdjusted, onOpenChange });

    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "25000" } });
    fireEvent.change(screen.getByLabelText(/justificativa/i), {
      target: { value: "divergência com extrato" },
    });

    fireEvent.click(screen.getByRole("button", { name: /confirmar ajuste/i }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("adjust_account_balance");
    expect(args).toMatchObject({
      _account_id: "acc-1",
      _target_balance: 250,
      _note: "divergência com extrato",
      _idempotency_key: expect.any(String),
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(onAdjusted).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("exibe toast de erro e mantém dialog aberto quando a RPC falha", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    const onOpenChange = vi.fn();
    open({ onOpenChange });

    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "30000" } });
    fireEvent.change(screen.getByLabelText(/justificativa/i), { target: { value: "teste" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar ajuste/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    // dialog não é fechado em caso de erro
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
