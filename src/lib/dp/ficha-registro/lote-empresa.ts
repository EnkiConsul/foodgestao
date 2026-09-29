/**
 * Conferência do LOTE inteiro contra a empresa selecionada.
 *
 * A correspondência por ficha (`matchUnidade`) já barra a criação de um
 * cadastro em empresa errada. Aqui olhamos o arquivo como um todo para avisar
 * logo na leitura — antes de o operador conferir 44 fichas — que o PDF é de
 * outro CNPJ.
 */
import { matchUnidade, type UnidadeCadastrada } from "./unidade-match";

export interface DivergenciaLote {
  /** Alguma ficha do arquivo é de CNPJ que não pertence à empresa selecionada. */
  divergente: boolean;
  /** CNPJs (só dígitos) lidos no arquivo que não conferem. */
  cnpjs: string[];
  /** Nomes de empregador lidos junto desses CNPJs. */
  empregadores: string[];
}

export function divergenciaLote(
  itens: Array<{ dados_extraidos?: unknown }>,
  unidades: UnidadeCadastrada[],
  empresaCnpj?: string | null,
): DivergenciaLote {
  const cnpjs = new Set<string>();
  const nomes = new Set<string>();

  for (const item of itens ?? []) {
    const dados = (item?.dados_extraidos ?? null) as Record<string, unknown> | null;
    const m = matchUnidade(dados, unidades, empresaCnpj);
    if (m.empresaConfere !== "nao") continue;
    if (m.cnpj_lido) cnpjs.add(m.cnpj_lido);
    const nome = m.empregador_lido?.trim();
    if (nome) nomes.add(nome);
  }

  return { divergente: cnpjs.size > 0, cnpjs: [...cnpjs], empregadores: [...nomes] };
}
