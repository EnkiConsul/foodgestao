/**
 * Interação real do formulário de contas, com backend simulado.
 *
 * Regras verificadas:
 * - editar e criar cópias são ações separadas: cada envio faz UMA mutação;
 * - saldo PJ é sempre por empresa e não se perde ao marcar/desmarcar;
 * - update sem linhas afetadas (RLS) não é sucesso;
 * - erro de RLS no insert mantém o diálogo aberto;
 * - exceção de rede não é anunciada como "nada salvo";
 * - importação só recebe conta pertencente ao contexto ativo;
 * - PF mantém saldo escalar e rótulo Pessoal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// jsdom não implementa ResizeObserver, usado pelos primitivos Radix.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const insertSpy = vi.fn();
const updateSpy = vi.fn();
const deleteSpy = vi.fn();
const rpcSpy = vi.fn();

let insertResult: { data: unknown; error: unknown } | (() => never) = { data: [], error: null };
let updateResult: { data: unknown; error: unknown } | (() => never) = { data: [{ id: "acc-1" }], error: null };

function settle(result: { data: unknown; error: unknown } | (() => never)) {
  if (typeof result === "function") return Promise.reject(result());
  return Promise.resolve(result);
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (rows: unknown) => {
        insertSpy(rows);
        return { select: () => settle(insertResult) };
      },
      update: (values: unknown) => {
        updateSpy(values);
        return { eq: () => ({ select: () => settle(updateResult) }) };
      },
      delete: () => {
        deleteSpy();
        return { in: () => Promise.resolve({ error: null }) };
      },
    }),
    rpc: (...args: unknown[]) => {
      rpcSpy(...args);
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

let context = { contextType: "pj" as "pj" | "pf", selectedCompanyId: "empresa-a" as string | null };
const companies = [
  { id: "empresa-a", name: "EMPRESA A", trade_name: "EMPRESA A" },
  { id: "empresa-b", name: "EMPRESA B", trade_name: "EMPRESA B" },
];
vi.mock("@/hooks/useCompanyContext", () => ({
  useCompanyContext: () => ({ ...context, companies }),
}));

vi.mock("@/components/accounts/BankSelect", () => ({
  BankSelect: () => <div data-testid="bank-select" />,
}));

import { AccountFormDialog } from "@/components/accounts/AccountFormDialog";
import type { Database } from "@/integrations/supabase/types";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

const existingAccount = {
  id: "acc-1",
  name: "CONTA A",
  account_type: "corrente",
  context: "pj",
  company_id: "empresa-a",
  initial_balance: 500,
  is_accounting: true,
  bank_slug: null,
  agency: null,
  account_number: null,
} as unknown as Account;

function open(props: Partial<Parameters<typeof AccountFormDialog>[0]> = {}) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AccountFormDialog open onOpenChange={onOpenChange} onSaved={onSaved} {...props} />,
  );
  return { onSaved, onOpenChange };
}

const balanceField = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const checkbox = (name: string) => screen.getByRole("checkbox", { name });
const submit = () => screen.getByRole("button", { name: /criar conta|criar cópias|^salvar$/i });

beforeEach(() => {
  cleanup();
  insertSpy.mockClear();
  updateSpy.mockClear();
  deleteSpy.mockClear();
  rpcSpy.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  insertResult = { data: [], error: null };
  updateResult = { data: [{ id: "acc-1" }], error: null };
  context = { contextType: "pj", selectedCompanyId: "empresa-a" };
});

describe("AccountFormDialog — criação em várias empresas", () => {
  it("preserva o saldo digitado ao marcar e desmarcar empresas", () => {
    open();
    fireEvent.change(balanceField(/Saldo inicial — EMPRESA A/), { target: { value: "100000" } });
    expect(balanceField(/Saldo inicial — EMPRESA A/).value).toBe("1.000,00");

    fireEvent.click(checkbox("EMPRESA B"));
    fireEvent.change(balanceField(/Saldo inicial — EMPRESA B/), { target: { value: "25050" } });
    // saldo da A continua intacto após a segunda empresa entrar
    expect(balanceField(/Saldo inicial — EMPRESA A/).value).toBe("1.000,00");

    fireEvent.click(checkbox("EMPRESA B"));
    fireEvent.click(checkbox("EMPRESA B"));
    expect(balanceField(/Saldo inicial — EMPRESA B/).value).toBe("250,50");
    expect(balanceField(/Saldo inicial — EMPRESA A/).value).toBe("1.000,00");
  });

  it("cria duas contas independentes em um único lote, com saldos distintos", async () => {
    insertResult = {
      data: [
        { id: "novo-a", company_id: "empresa-a" },
        { id: "novo-b", company_id: "empresa-b" },
      ],
      error: null,
    };
    const { onSaved, onOpenChange } = open();

    fireEvent.change(screen.getByLabelText(/Nome da conta/i), { target: { value: "BANCO X" } });
    fireEvent.click(checkbox("EMPRESA B"));
    fireEvent.change(balanceField(/Saldo inicial — EMPRESA A/), { target: { value: "100000" } });
    fireEvent.change(balanceField(/Saldo inicial — EMPRESA B/), { target: { value: "25050" } });
    fireEvent.click(submit());

    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    const rows = insertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ company_id: "empresa-a", initial_balance: 1000, context: "pj" });
    expect(rows[1]).toMatchObject({ company_id: "empresa-b", initial_balance: 250.5, context: "pj" });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("novo-a"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("erro de RLS no lote não indica sucesso nem fecha o diálogo", async () => {
    insertResult = { data: null, error: { message: "new row violates row-level security policy" } };
    const { onSaved, onOpenChange } = open();

    fireEvent.change(screen.getByLabelText(/Nome da conta/i), { target: { value: "BANCO X" } });
    fireEvent.click(submit());

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/permissão/i);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("exceção de rede não é anunciada como nada salvo", async () => {
    insertResult = () => {
      throw new TypeError("Failed to fetch");
    };
    open();
    fireEvent.change(screen.getByLabelText(/Nome da conta/i), { target: { value: "BANCO X" } });
    fireEvent.click(submit());

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const message = String(toastError.mock.calls[0][0]);
    expect(message).toMatch(/não foi possível confirmar/i);
    expect(message).not.toMatch(/nada foi/i);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("destino fora da empresa ativa atualiza a listagem sem abrir importação", async () => {
    insertResult = { data: [{ id: "novo-b", company_id: "empresa-b" }], error: null };
    const { onSaved } = open();

    fireEvent.change(screen.getByLabelText(/Nome da conta/i), { target: { value: "BANCO X" } });
    fireEvent.click(checkbox("EMPRESA A")); // desmarca a empresa ativa
    fireEvent.click(checkbox("EMPRESA B"));
    fireEvent.click(submit());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(undefined);
  });

  it("PF mantém saldo único e rótulo Pessoal", async () => {
    context = { contextType: "pf", selectedCompanyId: null };
    insertResult = { data: [{ id: "novo-pf", company_id: null }], error: null };
    const { onSaved } = open();

    expect(screen.getByText(/Pessoal/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nome da conta/i), { target: { value: "CONTA PESSOAL" } });
    fireEvent.change(screen.getByLabelText("Saldo inicial"), { target: { value: "30000" } });
    fireEvent.click(submit());

    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    const rows = insertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ company_id: null, context: "pf", initial_balance: 300 });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("novo-pf"));
  });
});

describe("AccountFormDialog — edição e cópias são ações separadas", () => {
  it("salvar edição só atualiza dados cadastrais, sem insert nem delete", async () => {
    const { onSaved, onOpenChange } = open({ account: existingAccount });

    fireEvent.change(screen.getByLabelText(/Nome da conta/i), { target: { value: "CONTA A RENOMEADA" } });
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ name: "CONTA A RENOMEADA" });
    expect(updateSpy.mock.calls[0][0]).not.toHaveProperty("initial_balance");
    expect(updateSpy.mock.calls[0][0]).not.toHaveProperty("company_id");
    expect(insertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("update com zero linhas afetadas é tratado como falha", async () => {
    updateResult = { data: [], error: null };
    const { onSaved, onOpenChange } = open({ account: existingAccount });

    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/nenhuma alteração/i);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("modo cópia só insere: não chama update nem delete", async () => {
    insertResult = { data: [{ id: "novo-b", company_id: "empresa-b" }], error: null };
    const { onSaved } = open({ account: existingAccount });

    fireEvent.click(screen.getByRole("button", { name: /criar em outras empresas/i }));
    expect(screen.getByText(/valem SOMENTE para as novas contas/i)).toBeInTheDocument();
    // a empresa da própria conta não é oferecida como destino
    expect(screen.queryByRole("checkbox", { name: "EMPRESA A" })).toBeNull();

    fireEvent.click(checkbox("EMPRESA B"));
    fireEvent.change(balanceField(/Saldo inicial — EMPRESA B/), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: /criar cópias/i }));

    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    const rows = insertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toEqual([expect.objectContaining({ company_id: "empresa-b", initial_balance: 50 })]);
    // destino não é a empresa ativa: nada de importação
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined));
  });

  it("modo cópia sem empresa marcada não dispara mutação", async () => {
    open({ account: existingAccount });
    fireEvent.click(screen.getByRole("button", { name: /criar em outras empresas/i }));
    fireEvent.click(screen.getByRole("button", { name: /criar cópias/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Selecione ao menos uma empresa"));
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
