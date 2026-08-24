import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkOnboardingCnpj, resolveOnboardingByExistingCnpj, resolveOnboardingStatus } from "./onboardingStatus";
import { marcarOnboardingConcluido } from "./onboardingFinalize";

const responses: Record<string, any> = {};
const calls: Array<{ table: string; method: string; args: any[] }> = [];
let functionResponse: { data: any; error: any } = { data: null, error: null };

class QueryMock {
  constructor(private table: string) {}

  select(...args: any[]) {
    calls.push({ table: this.table, method: "select", args });
    return this;
  }

  eq(...args: any[]) {
    calls.push({ table: this.table, method: "eq", args });
    return this;
  }

  limit(...args: any[]) {
    calls.push({ table: this.table, method: "limit", args });
    return Promise.resolve(responses[this.table] ?? { data: [], error: null });
  }

  maybeSingle() {
    calls.push({ table: this.table, method: "maybeSingle", args: [] });
    return Promise.resolve(responses[this.table] ?? { data: null, error: null });
  }
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => new QueryMock(table),
    functions: {
      invoke: vi.fn(async () => functionResponse),
    },
  },
}));

vi.mock("./onboardingFinalize", () => ({
  marcarOnboardingConcluido: vi.fn(async () => ({ ok: true })),
}));

describe("onboardingStatus", () => {
  beforeEach(() => {
    calls.length = 0;
    responses.profiles = { data: { onboarding_completed: false }, error: null };
    responses.companies = { data: [], error: null };
    responses.company_members = { data: [], error: null };
    functionResponse = { data: null, error: null };
    vi.mocked(marcarOnboardingConcluido).mockClear();
  });

  it("distingue CNPJ disponível, cadastrado e acessível sem expor dados da empresa", async () => {
    functionResponse = { data: { status: "available" }, error: null };
    await expect(checkOnboardingCnpj("58.241.366/0001-32")).resolves.toEqual({ status: "available", companyId: null });

    functionResponse = { data: { status: "registered" }, error: null };
    await expect(checkOnboardingCnpj("58.241.366/0001-32")).resolves.toEqual({ status: "registered", companyId: null });

    functionResponse = { data: { status: "accessible", company_id: "company-1" }, error: null };
    await expect(checkOnboardingCnpj("58.241.366/0001-32")).resolves.toEqual({ status: "accessible", companyId: "company-1" });
  });

  it("considera concluído e corrige o profile quando já existe empresa ativa do usuário", async () => {
    responses.companies = { data: [{ id: "company-1" }], error: null };

    const result = await resolveOnboardingStatus("user-1");

    expect(result).toEqual({ completed: true, companyId: "company-1" });
    expect(marcarOnboardingConcluido).toHaveBeenCalledWith("user-1");
  });

  it("considera concluído quando já existe vínculo ativo em empresa", async () => {
    responses.company_members = { data: [{ company_id: "company-member-1" }], error: null };

    const result = await resolveOnboardingStatus("user-1");

    expect(result).toEqual({ completed: true, companyId: "company-member-1" });
    expect(marcarOnboardingConcluido).toHaveBeenCalledWith("user-1");
  });

  it("mantém pendente quando não há onboarding concluído nem empresa/vínculo", async () => {
    const result = await resolveOnboardingStatus("user-1");

    expect(result).toEqual({ completed: false, companyId: null });
    expect(marcarOnboardingConcluido).not.toHaveBeenCalled();
  });

  it("trata CNPJ já cadastrado como sucesso somente se a empresa estiver acessível ao usuário", async () => {
    responses.companies = { data: [{ id: "company-1" }], error: null };

    const result = await resolveOnboardingByExistingCnpj("user-1", "58.241.366/0001-32");

    expect(result).toEqual({ completed: true, companyId: "company-1" });
    expect(marcarOnboardingConcluido).toHaveBeenCalledWith("user-1");
    expect(calls).toContainEqual({ table: "companies", method: "eq", args: ["cnpj", "58241366000132"] });
  });

  it("não conclui onboarding para CNPJ cadastrado sem acesso via RLS", async () => {
    const result = await resolveOnboardingByExistingCnpj("user-1", "58.241.366/0001-32");

    expect(result).toEqual({ completed: false, companyId: null });
    expect(marcarOnboardingConcluido).not.toHaveBeenCalled();
  });
});
