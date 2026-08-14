import { supabase } from "@/integrations/supabase/client";

export interface CompanyContact {
  id: string;
  name: string;
  type: string | null;
  document: string | null;
}

/** Tamanho de página: o PostgREST limita respostas (padrão 1000 linhas). */
export const CONTACTS_PAGE_SIZE = 500;

/**
 * Busca TODOS os contatos vinculados à empresa, paginando por `range` até o fim.
 * Sem isso, empresas com muitos fornecedores teriam a lista truncada silenciosamente.
 */
export async function fetchAllCompanyContacts(
  companyId: string,
  pageSize = CONTACTS_PAGE_SIZE,
): Promise<{ data: CompanyContact[]; error: { message: string } | null }> {
  const all: CompanyContact[] = [];
  let from = 0;

  // Loop de páginas: para quando a última página vier incompleta.
  for (;;) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, contact_type, document, is_active, contact_companies!inner(company_id)")
      .eq("contact_companies.company_id", companyId)
      .order("name")
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) return { data: all, error };

    const page = (data ?? []) as unknown as {
      id: string; name: string; contact_type: string | null; document: string | null;
    }[];

    for (const c of page) {
      all.push({
        id: c.id,
        name: c.name,
        type: c.contact_type ?? null,
        document: c.document ?? null,
      });
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}

/** Normaliza documento (só dígitos) para comparação. */
export function normalizeDoc(doc: string | null | undefined): string | null {
  const d = (doc ?? "").replace(/\D+/g, "");
  return d.length >= 11 ? d : null;
}

/** Normaliza nome (minúsculo, sem acento/pontuação) para comparação. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ltda|me|mei|epp|s\/a|sa|eireli)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Procura um contato existente do usuário por documento (prioritário) ou nome
 * normalizado. Evita cadastrar duplicados a partir do extrato.
 */
export async function findExistingContact(params: {
  userId: string;
  name: string;
  document: string | null;
}): Promise<{ id: string; name: string; contact_type: string | null; document: string | null } | null> {
  const { userId, name, document } = params;
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, contact_type, document")
    .eq("user_id", userId);
  if (error || !data) return null;

  const rows = data as unknown as {
    id: string; name: string; contact_type: string | null; document: string | null;
  }[];

  const doc = normalizeDoc(document);
  if (doc) {
    const byDoc = rows.find((r) => normalizeDoc(r.document) === doc);
    if (byDoc) return byDoc;
  }
  const key = normalizeName(name);
  if (!key) return null;
  return rows.find((r) => normalizeName(r.name) === key) ?? null;
}

/** Garante o vínculo do contato com a empresa (idempotente). */
export async function ensureContactCompanyLink(contactId: string, companyId: string) {
  const { data } = await supabase
    .from("contact_companies")
    .select("contact_id")
    .eq("contact_id", contactId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) {
    await supabase.from("contact_companies").insert({
      contact_id: contactId,
      company_id: companyId,
    } as never);
  }
}
