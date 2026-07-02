import { supabase } from "@/integrations/supabase/client";
import type { ParsedStatementEntry, ImportSuggestion, ReviewRow } from "./types";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "")
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDoc(doc: string | null | undefined): string | null {
  if (!doc) return null;
  return doc.replace(/\D+/g, "");
}

type CtxArgs = {
  userId: string;
  context: "pf" | "pj";
  companyId: string | null;
};

export async function suggestForEntries(
  entries: ParsedStatementEntry[],
  ctx: CtxArgs
): Promise<ReviewRow[]> {
  if (entries.length === 0) return [];

  // Load contacts to match by document/name
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, document")
    .eq("user_id", ctx.userId);
  const contactByDoc = new Map<string, string>();
  const contactList = (contacts ?? []) as { id: string; name: string; document: string | null }[];
  for (const c of contactList) {
    const d = cleanDoc(c.document);
    if (d) contactByDoc.set(d, c.id);
  }

  // Recent history for pattern reuse (last 500)
  const { data: history } = await supabase
    .from("transactions")
    .select("description, category_id, contact_id, transaction_type, context, company_id")
    .eq("user_id", ctx.userId)
    .eq("context", ctx.context)
    .order("transaction_date", { ascending: false })
    .limit(500);
  const histRows = (history ?? []).filter(
    (h) => (ctx.context === "pf" ? true : h.company_id === ctx.companyId)
  );

  const rows: ReviewRow[] = [];
  for (const e of entries) {
    let suggestion: ImportSuggestion = { category_id: null, contact_id: null, source: null };

    // 1) contact by document
    const doc = cleanDoc(e.counterparty_document);
    const contactByDocId = doc ? contactByDoc.get(doc) ?? null : null;
    if (contactByDocId) suggestion.contact_id = contactByDocId;

    // 2) history match by normalized description tokens
    const target = normalize(e.description);
    if (target) {
      const tokens = target.split(" ").filter((t) => t.length >= 4);
      let best: { score: number; row: (typeof histRows)[number] } | null = null;
      for (const h of histRows) {
        if (!h.description) continue;
        if (h.transaction_type !== e.transaction_type) continue;
        const hn = normalize(h.description);
        if (!hn) continue;
        let score = 0;
        for (const t of tokens) if (hn.includes(t)) score += 1;
        if (score > 0 && (!best || score > best.score)) best = { score, row: h };
      }
      if (best && best.score >= 2) {
        suggestion.category_id = suggestion.category_id ?? best.row.category_id;
        suggestion.contact_id = suggestion.contact_id ?? best.row.contact_id;
        suggestion.source = "history";
      }
    }

    if (!suggestion.source && suggestion.contact_id) suggestion.source = "document";

    // 3) keyword fallback (very light; category names)
    // Left intentionally minimal; users pick in the review step.

    rows.push({
      ...e,
      ...suggestion,
      include: true,
      duplicate: false,
      duplicate_kind: null,
    });
  }

  return rows;
}

export async function markDuplicates(
  rows: ReviewRow[],
  accountId: string
): Promise<ReviewRow[]> {
  if (rows.length === 0) return rows;
  const hashes = rows.map((r) => r.import_hash);
  const { data } = await supabase
    .from("transactions")
    .select("import_hash")
    .eq("account_id", accountId)
    .in("import_hash", hashes);
  const existing = new Set((data ?? []).map((r) => (r as { import_hash: string }).import_hash));
  const seenInFile = new Set<string>();
  return rows.map((r) => {
    const duplicateKind = existing.has(r.import_hash)
      ? "existing"
      : seenInFile.has(r.import_hash)
        ? "file"
        : null;

    seenInFile.add(r.import_hash);

    return duplicateKind
      ? { ...r, duplicate: true, duplicate_kind: duplicateKind, include: false }
      : { ...r, duplicate: false, duplicate_kind: null };
  });
}
