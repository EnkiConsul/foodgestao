/**
 * Regressão: a categoria criada precisa nascer vinculada à empresa em uso.
 *
 * A lista de categorias da empresa usa `category_companies!inner`, então sem
 * vínculo a categoria existe no banco mas nunca aparece. O diálogo agora usa as
 * empresas do contexto e grava sempre a empresa selecionada, mesmo para quem é
 * apenas membro da empresa e mesmo que a lista de empresas chegue depois.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const COMPANY_ATIVA = "11111111-1111-1111-1111-111111111111";
const OUTRA_EMPRESA = "33333333-3333-3333-3333-333333333333";
const USER_ID = "22222222-2222-2222-2222-222222222222";

/** Empresas acessíveis devolvidas pelo contexto. */
let empresasDoContexto: { id: string; name: string; trade_name: string | null }[] = [];
const inserts: { table: string; rows: any }[] = [];
let falharVinculo = false;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: USER_ID, email: "teste@exemplo.com" } }),
}));

vi.mock("@/hooks/useCompanyContext", () => ({
  useCompanyContext: () => ({
    contextType: "pj",
    selectedCompanyId: COMPANY_ATIVA,
    companies: empresasDoContexto,
    loading: false,
    syncing: false,
    setContext: () => {},
    refreshCompanies: async () => undefined,
  }),
}));

const toastCalls: string[] = [];
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastCalls.push(`success:${m}`),
    error: (m: string) => toastCalls.push(`error:${m}`),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const chain: any = {
      _table: table,
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      or: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({ data: { id: "cat-nova" }, error: null }),
      insert: (rows: any) => {
        inserts.push({ table, rows });
        const erro =
          table === "category_companies" && falharVinculo
            ? { message: "permissão negada" }
            : null;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "cat-nova" }, error: null }),
          }),
          then: (r: any) => Promise.resolve({ data: null, error: erro }).then(r),
        };
      },
      delete: () => chain,
      update: () => chain,
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";

const renderDialog = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CategoryFormDialog open onOpenChange={() => {}} onSaved={() => {}} />
    </QueryClientProvider>,
  );
};

const preencherESalvar = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^Nome/i), "FRETES DE TESTE");
  const trigger = screen.getByText("Selecione o subtipo").closest("button")!;
  trigger.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "Despesa" }));
  await user.click(screen.getByRole("button", { name: /Criar|Salvar/i }));
};

const vinculoGravado = async () => {
  await waitFor(() => {
    expect(inserts.some((i) => i.table === "category_companies")).toBe(true);
  });
  return inserts.find((i) => i.table === "category_companies")!;
};

beforeEach(() => {
  inserts.length = 0;
  toastCalls.length = 0;
  falharVinculo = false;
  empresasDoContexto = [{ id: COMPANY_ATIVA, name: "EMPRESA TESTE", trade_name: null }];
  (window as any).HTMLElement.prototype.scrollIntoView = function () {};
  (window as any).HTMLElement.prototype.hasPointerCapture = function () { return false; };
  (window as any).HTMLElement.prototype.releasePointerCapture = function () {};
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

describe("[categorias] vínculo automático com a empresa em uso", () => {
  it("membro da empresa (não dono) cria categoria já vinculada à empresa em uso", async () => {
    renderDialog();
    await preencherESalvar();

    const vinculo = await vinculoGravado();
    expect(vinculo.rows).toEqual([{ category_id: "cat-nova", company_id: COMPANY_ATIVA }]);
    expect(toastCalls).toContain("success:Categoria criada!");
  });

  it("lista de empresas ainda vazia na abertura: empresa em uso continua vinculada", async () => {
    empresasDoContexto = [];
    renderDialog();
    await preencherESalvar();

    const vinculo = await vinculoGravado();
    expect(vinculo.rows).toEqual([{ category_id: "cat-nova", company_id: COMPANY_ATIVA }]);
  });

  it("falha na gravação do vínculo não exibe sucesso", async () => {
    falharVinculo = true;
    renderDialog();
    await preencherESalvar();

    await vinculoGravado();
    await waitFor(() => {
      expect(toastCalls.some((t) => t.startsWith("error:"))).toBe(true);
    });
    expect(toastCalls).not.toContain("success:Categoria criada!");
  });

  it("outras empresas marcadas são gravadas junto com a empresa em uso", async () => {
    empresasDoContexto = [
      { id: COMPANY_ATIVA, name: "EMPRESA TESTE", trade_name: null },
      { id: OUTRA_EMPRESA, name: "EMPRESA SECUNDARIA", trade_name: null },
    ];
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /EMPRESA SECUNDARIA/i }));
    await preencherESalvar();

    const vinculo = await vinculoGravado();
    const ids = (vinculo.rows as any[]).map((r) => r.company_id).sort();
    expect(ids).toEqual([COMPANY_ATIVA, OUTRA_EMPRESA].sort());
  });
});
