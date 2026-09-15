import { describe, it, expect } from "vitest";
import { resolveScopedPluggyAccount } from "@/lib/pluggy/scopedPluggyAccount";

const EMPRESA = "bab7a4ac-0b95-4b69-ba18-ac862bfb038b";

const row = (
  id: string,
  connection: string,
  status: string | null,
  opts: { company?: string | null; connCompany?: string | null; embed?: boolean } = {},
) => ({
  pluggy_account_id: id,
  connection_id: connection,
  company_id: opts.company === undefined ? EMPRESA : opts.company,
  name: "Conta",
  number_masked: null,
  pluggy_connections:
    opts.embed === false
      ? null
      : {
          id: connection,
          status,
          company_id: opts.connCompany === undefined ? EMPRESA : opts.connCompany,
        },
});

describe("resolveScopedPluggyAccount", () => {
  it("1 conexão ativa + 2 encerradas devolve o vínculo ativo", () => {
    // Caso real do Praianos (conta final 7943).
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [
        row("f242aac5", "a4ca50e4", "updated"),
        row("3fab171a", "766357e8", "deleted"),
        row("31f0d2e9", "9f1bdb88", "deleted"),
      ],
    });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") {
      expect(r.account.pluggyAccountId).toBe("f242aac5");
      expect(r.account.connectionId).toBe("a4ca50e4");
    }
  });

  it("somente conexões encerradas não amplia o escopo", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "deleted"), row("b", "c2", "revoked")],
    });
    expect(r.status).toBe("inactive_only");
  });

  it("erro de consulta não vira conta sem vínculo", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: null,
      error: { message: "JSON object requested, multiple rows returned" },
    });
    expect(r.status).toBe("error");
  });

  it("nenhuma linha é vínculo inexistente", () => {
    const r = resolveScopedPluggyAccount({ companyId: EMPRESA, rows: [] });
    expect(r.status).toBe("not_linked");
  });

  it("vínculo de outra empresa não resolve (registro)", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "updated", { company: "outra-empresa" })],
    });
    expect(r.status).toBe("foreign_company");
  });

  it("vínculo de outra empresa não resolve (conexão)", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "updated", { connCompany: "outra-empresa" })],
    });
    expect(r.status).toBe("foreign_company");
  });

  it("company_id ausente não é presumido da mesma empresa", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "updated", { company: null })],
    });
    expect(r.status).toBe("foreign_company");
  });

  it("status ausente falha explicitamente, não é aceito como ativo", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", null)],
    });
    expect(r.status).toBe("unverified");
  });

  it("embed da conexão ausente falha explicitamente", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "updated", { embed: false })],
    });
    expect(r.status).toBe("foreign_company");
  });

  it("status em branco também é unverified", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "   ")],
    });
    expect(r.status).toBe("unverified");
  });

  it("ativa + uma sem status resolve pela ativa, sem presumir a outra", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", null), row("b", "c2", "updated")],
    });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.account.pluggyAccountId).toBe("b");
  });

  it("duas conexões ativas é ambiguidade explícita, sem escolher uma", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [row("a", "c1", "updated"), row("b", "c2", "outdated")],
    });
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidates).toHaveLength(2);
  });

  it("linha sem connection_id é ignorada", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [{ pluggy_account_id: "a", connection_id: null }],
    });
    expect(r.status).toBe("not_linked");
  });

  it("embed em array também é lido", () => {
    const r = resolveScopedPluggyAccount({
      companyId: EMPRESA,
      rows: [
        {
          pluggy_account_id: "a",
          connection_id: "c1",
          company_id: EMPRESA,
          pluggy_connections: [{ id: "c1", status: "deleted", company_id: EMPRESA }],
        },
        {
          pluggy_account_id: "b",
          connection_id: "c2",
          company_id: EMPRESA,
          pluggy_connections: [{ id: "c2", status: "updated", company_id: EMPRESA }],
        },
      ],
    });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.account.pluggyAccountId).toBe("b");
  });
});
