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
export async function lerVinculos<T extends Record<string, string>>(
  tabela: string,
  colunaCadastro: string,
  companyId: string | null | undefined,
): Promise<T[]> {
  const colunas = `${colunaCadastro}, company_id`;
  const acumulado: T[] = [];

  for (let pagina = 0; ; pagina++) {
    let query = (supabase.from(tabela as never) as never as {
      select: (c: string) => never;
    })
      .select(colunas) as never as {
      eq: (c: string, v: string) => unknown;
      order: (c: string) => unknown;
      range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }>;
    };

    if (companyId) query = (query.eq("company_id", companyId) as typeof query);
    query = (query.order("company_id") as typeof query);
    query = ((query as unknown as { order: (c: string) => unknown }).order(colunaCadastro) as typeof query);

    const inicio = pagina * PAGINA_VINCULOS;
    const { data, error } = await query.range(inicio, inicio + PAGINA_VINCULOS - 1);
    if (error) throw error;

    const lote = data ?? [];
    acumulado.push(...lote);
    if (lote.length < PAGINA_VINCULOS) break;
  }

  return acumulado;
}
