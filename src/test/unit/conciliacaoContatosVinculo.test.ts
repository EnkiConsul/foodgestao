/**
 * Conciliação: a lista de clientes/fornecedores deve trazer SOMENTE os
 * vinculados à empresa em uso, e o vínculo gravado precisa ser conferido
 * (antes o erro era descartado e a confirmação falhava com contact_forbidden).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const estado = {
  contatosDaEmpresa: [] as { id: string; name: string; contact_type: string | null; document: string | null }[],
  contatosDoUsuario: [] as { id: string; name: string; contact_type: string | null; document: string | null }[],
  vinculoExistente: null as { contact_id: string } | null,
  vinculoAposInsert: null as { contact_id: string } | null,
  erroInsert: null as { message: string } | null,
  insertChamado: 0,
  selectsDeVinculo: 0,
};

vi.mock("@/integrations/supabase/client", () => {
  const builderContacts = () => {
    let porEmpresa = false;
    const api: Record<string, unknown> = {};
    const self = () => api as never;
    api.select = (cols: string) => {
      porEmpresa = cols.includes("contact_companies!inner");
      return self();
    };
    api.eq = () => self();
    api.order = () => self();
    api.range = async () => ({
      data: porEmpresa ? estado.contatosDaEmpresa : estado.contatosDoUsuario,
      error: null,
    });
    return api as never;
  };

  const builderVinculos = () => {
    const api: Record<string, unknown> = {};
    const self = () => api as never;
    api.select = () => self();
    api.eq = () => self();
    api.maybeSingle = async () => {
      estado.selectsDeVinculo += 1;
      return {
        data: estado.selectsDeVinculo === 1 ? estado.vinculoExistente : estado.vinculoAposInsert,
        error: null,
      };
    };
    api.insert = async () => {
      estado.insertChamado += 1;
      return { error: estado.erroInsert };
    };
    return api as never;
  };

  return {
    supabase: {
      from: (tabela: string) => (tabela === "contacts" ? builderContacts() : builderVinculos()),
    },
  };
});

import { fetchConciliacaoContacts, ensureContactCompanyLink } from "@/lib/conciliacao/contacts";
import { criarResultado, resumoConfirmacao } from "@/lib/conciliacao/confirmResultado";

beforeEach(() => {
  estado.contatosDaEmpresa = [];
  estado.contatosDoUsuario = [];
  estado.vinculoExistente = null;
  estado.vinculoAposInsert = null;
  estado.erroInsert = null;
  estado.insertChamado = 0;
  estado.selectsDeVinculo = 0;
});

describe("lista de clientes/fornecedores da conciliação", () => {
  it("traz somente os vinculados à empresa em uso", async () => {
    estado.contatosDaEmpresa = [{ id: "c1", name: "FORNECEDOR DA EMPRESA", contact_type: "fornecedor", document: null }];
    estado.contatosDoUsuario = [
      { id: "c1", name: "FORNECEDOR DA EMPRESA", contact_type: "fornecedor", document: null },
      { id: "c2", name: "CADASTRO SEM VINCULO", contact_type: "fornecedor", document: null },
    ];

    const { data, error } = await fetchConciliacaoContacts("emp-1", "user-1");

    expect(error).toBeNull();
    expect(data.map((c) => c.id)).toEqual(["c1"]);
    expect(data.every((c) => c.linkedToCompany)).toBe(true);
  });

  it("não oferece nada quando a empresa não tem cadastros vinculados", async () => {
    estado.contatosDoUsuario = [{ id: "c2", name: "CADASTRO SEM VINCULO", contact_type: "cliente", document: null }];
    const { data } = await fetchConciliacaoContacts("emp-1", "user-1");
    expect(data).toEqual([]);
  });
});

describe("gravação do vínculo contato ↔ empresa", () => {
  it("é idempotente: vínculo já existente não grava de novo", async () => {
    estado.vinculoExistente = { contact_id: "c1" };
    const r = await ensureContactCompanyLink("c1", "emp-1");
    expect(r.ok).toBe(true);
    expect(estado.insertChamado).toBe(0);
  });

  it("confirma o vínculo depois de gravar", async () => {
    estado.vinculoAposInsert = { contact_id: "c1" };
    const r = await ensureContactCompanyLink("c1", "emp-1");
    expect(r.ok).toBe(true);
    expect(estado.insertChamado).toBe(1);
  });

  it("devolve erro quando o vínculo não é gravado (nunca mais silencioso)", async () => {
    estado.erroInsert = { message: "new row violates row-level security policy" };
    const r = await ensureContactCompanyLink("c1", "emp-1");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("row-level security");
  });
});

describe("motivo de bloqueio", () => {
  it("explica em português o contato sem vínculo", () => {
    const r = criarResultado();
    r.falhas.push({ ids: ["s1"], motivo: "contato_sem_vinculo" });
    const resumo = resumoConfirmacao(r, 1);
    expect(JSON.stringify(resumo)).toContain("não está ligado à empresa");
  });
});
