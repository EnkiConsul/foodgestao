/**
 * Reprodução do bug: categoria criada não aparece na empresa.
 *
 * A lista de categorias da empresa (src/pages/Categorias.tsx:270) usa
 * `category_companies!inner`, então uma categoria sem vínculo na tabela
 * category_companies nunca aparece. O diálogo marca as empresas a vincular a
 * partir de uma consulta que filtra `companies.user_id = auth.uid()`
 * (src/components/categories/CategoryFormDialog.tsx:151-162), ou seja só
 * empresas das quais o usuário é DONO. Quem opera uma empresa como membro
 * fica sem nenhuma empresa marcada, o vínculo não é gravado
 * (guarda `selectedCompanies.size > 0`, linha 412) e o aviso de sucesso
 * aparece de qualquer forma (linha 427).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const COMPANY_ATIVA = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

/** Empresas que a consulta do diálogo devolve (filtro user_id = dono). */
let empresasDoDono: { id: string; name: string }[] = [];
const inserts: { table: string; rows: any }[] = [];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: USER_ID, email: "teste@exemplo.com" } }),
}));

vi.mock("@/hooks/useCompanyContext", () => ({
  useCompanyContext: () => ({ contextType: "pj", selectedCompanyId: COMPANY_ATIVA }),
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
      single: () =>
        Promise.resolve({ data: { id: "cat-nova" }, error: null }),
      insert: (rows: any) => {
        inserts.push({ table, rows });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "cat-nova" }, error: null }),
          }),
          then: (r: any) => Promise.resolve({ data: null, error: null }).then(r),
        };
      },
      delete: () => chain,
      update: () => chain,
      then: (resolve: any) => {
        const data =
          table === "companies" ? empresasDoDono : table === "category_companies" ? [] : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
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
  // Subtipo é obrigatório na validação (categorySchema)
  const trigger = screen.getByText("Selecione o subtipo").closest("button")!;
  trigger.focus();
  await user.keyboard("{Enter}");
  await user.click(await screen.findByRole("option", { name: "Despesa" }));
  await user.click(screen.getByRole("button", { name: /Criar|Salvar/i }));
};

beforeEach(() => {
  inserts.length = 0;
  toastCalls.length = 0;
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

describe("[categorias] vínculo com a empresa ativa ao criar", () => {
  it("BUG: usuário que é apenas membro da empresa cria categoria sem vínculo e ainda vê sucesso", async () => {
    empresasDoDono = []; // membro: não é dono de nenhuma empresa
    renderDialog();
    await preencherESalvar();

    await waitFor(() => {
      expect(inserts.some((i) => i.table === "categories")).toBe(true);
    });

    const vinculos = inserts.filter((i) => i.table === "category_companies");
    expect(vinculos).toHaveLength(0); // nenhum vínculo -> invisível na lista
    expect(toastCalls).toContain("success:Categoria criada!"); // sucesso silencioso
  });

  it("BUG (corrida): dono da empresa, mas a lista de empresas chega depois do efeito que marca as caixas -> nenhum vínculo", async () => {
    empresasDoDono = [{ id: COMPANY_ATIVA, name: "EMPRESA TESTE" }];
    renderDialog();
    // O efeito de src/.../CategoryFormDialog.tsx:248 roda na abertura, quando a
    // consulta de empresas ainda não respondeu, e não reexecuta depois
    // (deps sem `companies`), deixando nenhuma empresa marcada.
    await preencherESalvar();

    await waitFor(() => {
      expect(inserts.some((i) => i.table === "categories")).toBe(true);
    });
    expect(inserts.filter((i) => i.table === "category_companies")).toHaveLength(0);
    expect(toastCalls).toContain("success:Categoria criada!");
  });

  it("controle: marcando a empresa manualmente, o vínculo é gravado na empresa ativa", async () => {
    empresasDoDono = [{ id: COMPANY_ATIVA, name: "EMPRESA TESTE" }];
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /EMPRESA TESTE/i }));
    await preencherESalvar();

    await waitFor(() => {
      expect(inserts.some((i) => i.table === "category_companies")).toBe(true);
    });
    const vinculo = inserts.find((i) => i.table === "category_companies")!;
    expect(vinculo.rows).toEqual([
      { category_id: "cat-nova", company_id: COMPANY_ATIVA },
    ]);
  });
});
