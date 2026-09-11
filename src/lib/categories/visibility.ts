import { supabase } from "@/integrations/supabase/client";

/**
 * Sincroniza a visibilidade de uma categoria por empresa gravando apenas a
 * diferença: remove somente as empresas desmarcadas e insere somente as
 * recém-marcadas. Apagar tudo e recriar fazia a categoria desaparecer de
 * empresas que continuaram marcadas quando a recriação era recusada.
 */
export async function syncCategoryCompanies(
  categoryId: string,
  atual: Iterable<string>,
  desejado: Iterable<string>,
): Promise<{ error: { message: string } | null }> {
  const atuais = new Set(atual);
  const desejados = new Set(desejado);
  const remover = [...atuais].filter((id) => !desejados.has(id));
  const adicionar = [...desejados].filter((id) => !atuais.has(id));

  if (remover.length > 0) {
    const { error } = await supabase
      .from("category_companies")
      .delete()
      .eq("category_id", categoryId)
      .in("company_id", remover);
    if (error) return { error };
  }

  if (adicionar.length > 0) {
    const { error } = await supabase
      .from("category_companies")
      .insert(adicionar.map((company_id) => ({ category_id: categoryId, company_id })));
    if (error) return { error };
  }

  return { error: null };
}
