/**
 * Lê todas as linhas de uma consulta em lotes, contornando o teto de 1.000
 * linhas por resposta. A consulta precisa ter ordenação estável (ex.: por id),
 * senão lotes diferentes podem repetir ou pular linhas.
 */
export const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // trava de segurança: 200 mil linhas

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
  throw new Error("Volume acima do limite de leitura em lotes");
}
