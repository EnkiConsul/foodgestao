import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedStatementEntry } from "./types";

// -- Chainable mock of the supabase client used by suggest.ts --
type Contact = { id: string; name: string; document: string | null };
type HistoryRow = {
  description: string;
  category_id: string | null;
  contact_id: string | null;
  transaction_type: "entrada" | "saida";
  context: "pf" | "pj";
  company_id: string | null;
};
type ExistingTx = { import_hash: string };

const state = {
  contacts: [] as Contact[],
  history: [] as HistoryRow[],
  existing: [] as ExistingTx[],
};

function makeBuilder(table: string) {
  let hashFilter: string[] | null = null;
  const b: any = {
    select: () => b,
    eq: () => b,
    order: () => b,
    limit: () => b,
    in: (_col: string, arr: string[]) => {
      hashFilter = arr;
      return b;
    },
    then: (resolve: (v: any) => void) => {
      if (table === "contacts") return resolve({ data: state.contacts });
      if (table === "transactions") {
        if (hashFilter) {
          return resolve({
            data: state.existing.filter((e) => hashFilter!.includes(e.import_hash)),
          });
        }
        return resolve({ data: state.history });
      }
      return resolve({ data: [] });
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

import { suggestForEntries, markDuplicates } from "./suggest";

const ctx = { userId: "user-1", context: "pf" as const, companyId: null };

function entry(over: Partial<ParsedStatementEntry> = {}): ParsedStatementEntry {
  return {
    date: "2026-06-05",
    description: "Pix recebido - Empresa X",
    amount: 100,
    transaction_type: "entrada",
    counterparty_document: null,
    counterparty_name: null,
    import_hash: "hash-" + Math.random().toString(36).slice(2),
    ...over,
  };
}

describe("suggestForEntries", () => {
  beforeEach(() => {
    state.contacts = [];
    state.history = [];
    state.existing = [];
  });

  it("returns [] for empty input without hitting the DB", async () => {
    const out = await suggestForEntries([], ctx);
    expect(out).toEqual([]);
  });

  it("matches contact by document (CNPJ)", async () => {
    state.contacts = [
      { id: "contact-1", name: "Empresa X", document: "12.345.678/0001-90" },
    ];
    const out = await suggestForEntries(
      [entry({ counterparty_document: "12345678000190" })],
      ctx,
    );
    expect(out[0].contact_id).toBe("contact-1");
    expect(out[0].source).toBe("document");
  });

  it("normalizes document formatting when matching contacts", async () => {
    state.contacts = [{ id: "c-2", name: "Y", document: "123.456.789-00" }];
    const out = await suggestForEntries(
      [entry({ counterparty_document: "12345678900" })],
      ctx,
    );
    expect(out[0].contact_id).toBe("c-2");
  });

  it("suggests category from history when >= 2 tokens match", async () => {
    state.history = [
      {
        description: "Pix recebido pagamento mensal cliente",
        category_id: "cat-A",
        contact_id: "contact-B",
        transaction_type: "entrada",
        context: "pf",
        company_id: null,
      },
    ];
    const out = await suggestForEntries(
      [entry({ description: "Pix recebido pagamento mensal Fulano" })],
      ctx,
    );
    expect(out[0].category_id).toBe("cat-A");
    expect(out[0].source).toBe("history");
  });

  it("ignores history rows with a different transaction_type", async () => {
    state.history = [
      {
        description: "Pix recebido pagamento mensal",
        category_id: "cat-A",
        contact_id: null,
        transaction_type: "saida", // opposite
        context: "pf",
        company_id: null,
      },
    ];
    const out = await suggestForEntries(
      [entry({ description: "Pix recebido pagamento mensal" })],
      ctx,
    );
    expect(out[0].category_id).toBeNull();
    expect(out[0].source).toBeNull();
  });

  it("filters history by company_id in PJ context", async () => {
    state.history = [
      {
        description: "compra fornecedor recorrente mensal",
        category_id: "cat-other",
        contact_id: null,
        transaction_type: "saida",
        context: "pj",
        company_id: "OTHER-CO",
      },
      {
        description: "compra fornecedor recorrente mensal",
        category_id: "cat-mine",
        contact_id: null,
        transaction_type: "saida",
        context: "pj",
        company_id: "MY-CO",
      },
    ];
    const out = await suggestForEntries(
      [
        entry({
          description: "compra fornecedor recorrente mensal",
          transaction_type: "saida",
        }),
      ],
      { userId: "u", context: "pj", companyId: "MY-CO" },
    );
    expect(out[0].category_id).toBe("cat-mine");
  });

  it("does not suggest when only 1 token matches (score threshold)", async () => {
    state.history = [
      {
        description: "pagamento xyz aleatorio inusitado",
        category_id: "cat-X",
        contact_id: null,
        transaction_type: "entrada",
        context: "pf",
        company_id: null,
      },
    ];
    const out = await suggestForEntries(
      [entry({ description: "pagamento nada em comum" })],
      ctx,
    );
    expect(out[0].category_id).toBeNull();
  });

  it("defaults include=true and duplicate=false", async () => {
    const out = await suggestForEntries([entry()], ctx);
    expect(out[0].include).toBe(true);
    expect(out[0].duplicate).toBe(false);
    expect(out[0].duplicate_kind).toBeNull();
  });
});

describe("markDuplicates", () => {
  beforeEach(() => {
    state.existing = [];
  });

  it("marks rows whose hash already exists in the account", async () => {
    state.existing = [{ import_hash: "H1" }];
    const rows = await markDuplicates(
      [
        { ...entry({ import_hash: "H1" }), category_id: null, contact_id: null, source: null, include: true, duplicate: false, duplicate_kind: null },
        { ...entry({ import_hash: "H2" }), category_id: null, contact_id: null, source: null, include: true, duplicate: false, duplicate_kind: null },
      ],
      "account-1",
    );
    expect(rows[0]).toMatchObject({ duplicate: true, duplicate_kind: "existing", include: false });
    expect(rows[1]).toMatchObject({ duplicate: false, duplicate_kind: null, include: true });
  });

  it("marks intra-file repeats as duplicate_kind='file'", async () => {
    const rows = await markDuplicates(
      [
        { ...entry({ import_hash: "SAME" }), category_id: null, contact_id: null, source: null, include: true, duplicate: false, duplicate_kind: null },
        { ...entry({ import_hash: "SAME" }), category_id: null, contact_id: null, source: null, include: true, duplicate: false, duplicate_kind: null },
      ],
      "account-1",
    );
    expect(rows[0].duplicate).toBe(false);
    expect(rows[1]).toMatchObject({ duplicate: true, duplicate_kind: "file", include: false });
  });

  it("returns [] for empty input", async () => {
    const rows = await markDuplicates([], "account-1");
    expect(rows).toEqual([]);
  });
});
