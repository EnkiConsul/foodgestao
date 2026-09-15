import { describe, it, expect } from "vitest";
import {
  assertCopyTargets,
  buildAccountRows,
  describeSaveResult,
  resolvePrimaryCreatedId,
  AccountTargetsError,
  type AccountCadastralData,
} from "@/lib/accounts/accountCopyTargets";

const cadastral: AccountCadastralData = {
  name: "  BANCO DO BRASIL  ",
  accountType: "corrente",
  bankSlug: "bb",
  agency: "0001",
  accountNumber: "12345-6",
  isAccounting: true,
};

describe("assertCopyTargets", () => {
  it("criação exige ao menos uma empresa", () => {
    expect(() => assertCopyTargets([], { requireAtLeastOne: true })).toThrow(AccountTargetsError);
  });

  it("edição sem cópias é permitida", () => {
    expect(() => assertCopyTargets([], { requireAtLeastOne: false })).not.toThrow();
  });

  it("rejeita empresa repetida", () => {
    expect(() =>
      assertCopyTargets(
        [
          { companyId: "a", initialBalance: 10 },
          { companyId: "a", initialBalance: 20 },
        ],
        { requireAtLeastOne: true },
      ),
    ).toThrow(/repetida/i);
  });

  it("rejeita cópia na própria empresa da conta editada", () => {
    expect(() =>
      assertCopyTargets([{ companyId: "a", initialBalance: 0 }], {
        requireAtLeastOne: false,
        currentCompanyId: "a",
      }),
    ).toThrow(/já pertence/i);
  });

  it("rejeita saldo inválido", () => {
    expect(() =>
      assertCopyTargets([{ companyId: "a", initialBalance: Number.NaN }], { requireAtLeastOne: true }),
    ).toThrow(/Saldo/i);
  });
});

describe("buildAccountRows", () => {
  it("cria uma linha independente por empresa, com saldo próprio", () => {
    const rows = buildAccountRows(
      cadastral,
      [
        { companyId: "empresa-a", initialBalance: 1000 },
        { companyId: "empresa-b", initialBalance: 250.5 },
      ],
      "user-1",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      company_id: "empresa-a",
      context: "pj",
      name: "BANCO DO BRASIL",
      initial_balance: 1000,
      current_balance: 1000,
    });
    expect(rows[1]).toMatchObject({
      company_id: "empresa-b",
      initial_balance: 250.5,
      current_balance: 250.5,
    });
  });

  it("PF cria conta pessoal sem empresa", () => {
    const rows = buildAccountRows(cadastral, [{ companyId: null, initialBalance: 0 }], "user-1");
    expect(rows[0]).toMatchObject({ company_id: null, context: "pf", initial_balance: 0 });
  });

  it("não carrega campos de conexão bancária/consentimento", () => {
    const rows = buildAccountRows(cadastral, [{ companyId: "a", initialBalance: 0 }], "user-1");
    const keys = Object.keys(rows[0]);
    expect(keys.some((k) => /pluggy|item_id|consent|credential/i.test(k))).toBe(false);
  });
});

describe("resolvePrimaryCreatedId", () => {
  it("devolve a conta da empresa atualmente selecionada", () => {
    const id = resolvePrimaryCreatedId(
      [
        { id: "id-b", company_id: "empresa-b" },
        { id: "id-a", company_id: "empresa-a" },
      ],
      "empresa-a",
    );
    expect(id).toBe("id-a");
  });

  it("sem conta na empresa ativa devolve undefined (nunca a de outra empresa)", () => {
    expect(
      resolvePrimaryCreatedId([{ id: "id-b", company_id: "empresa-b" }], "empresa-a"),
    ).toBeUndefined();
  });

  it("PF resolve pela conta sem empresa", () => {
    expect(resolvePrimaryCreatedId([{ id: "id-pf", company_id: null }], null)).toBe("id-pf");
  });

  it("nada criado devolve undefined", () => {
    expect(resolvePrimaryCreatedId([], "empresa-a")).toBeUndefined();
  });
});

describe("describeSaveResult", () => {
  it("informa quantas contas foram criadas", () => {
    expect(describeSaveResult(1, false)).toBe("Conta criada");
    expect(describeSaveResult(2, false)).toMatch(/2 contas criadas/);
    expect(describeSaveResult(0, true)).toBe("Conta atualizada");
  });
});
