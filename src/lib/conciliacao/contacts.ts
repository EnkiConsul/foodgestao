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
