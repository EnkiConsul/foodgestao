import { supabase } from "@/integrations/supabase/client";

/** Teto de linhas por resposta do servidor; paginamos em blocos desse tamanho. */
export const PAGINA_VINCULOS = 1000;

/**
 * Lê os vínculos "cadastro ↔ empresa" (categorias, contatos, formas de pagamento,
 * centros de custo) de forma segura:
 *
 * - filtra pela empresa em uso quando informada (evita trazer o mundo inteiro);
 * - ordena de forma determinística e pagina até esgotar, porque o servidor
 *   devolve no máximo 1000 linhas por requisição — sem isso, contas com muitos
 *   vínculos perdiam parte deles e os cadastros desapareciam dos formulários;
 * - propaga o erro em vez de devolver lista vazia silenciosa.
 */
export async function lerVinculos<T>(
  tabela: string,
  colunaCadastro: string,
  companyId: string | null | undefined,
): Promise<T[]> {
  const acumulado: T[] = [];

  for (let pagina = 0; ; pagina++) {
    // Tabelas associativas acessadas por nome dinâmico; tipagem gerada não cobre.
    let query: any = (supabase.from(tabela as any) as any)
      .select(`${colunaCadastro}, company_id`);
    if (companyId) query = query.eq("company_id", companyId);
    query = query.order("company_id").order(colunaCadastro);

    const inicio = pagina * PAGINA_VINCULOS;
    const { data, error } = await query.range(inicio, inicio + PAGINA_VINCULOS - 1);
    if (error) throw error;

    const lote = (data ?? []) as T[];
    acumulado.push(...lote);
    if (lote.length < PAGINA_VINCULOS) break;
  }

  return acumulado;
}
