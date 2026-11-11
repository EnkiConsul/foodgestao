/**
 * Base única de sindicatos (dp_sindicatos_catalogo): regras puras de sugestão.
 *
 * A abrangência de cada sindicato cresce sozinha — toda unidade que vincula o
 * sindicato acrescenta a sua cidade (no banco). Aqui só decidimos a ordem e o
 * destaque das sugestões para a unidade/empresa em edição.
 */

export type TipoSindicato = "laboral" | "patronal";

export interface SindicatoCatalogo {
  id: string;
  nome: string;
  tipo: TipoSindicato;
  cnpj: string | null;
  uf: string | null;
  municipios: string[];
  contato_telefone: string | null;
  data_base_mes: number | null;
}

export interface LocalSindicato {
  cidade?: string | null;
  uf?: string | null;
}

export interface SindicatoAdotado {
  catalogo_id?: string | null;
  cnpj?: string | null;
}

export interface SugestaoSindicato {
  item: SindicatoCatalogo;
  /** Já atende a cidade da unidade (ou de uma das unidades). */
  recomendado: boolean;
  /** Cidade que motivou a recomendação, já formatada. */
  cidadeRecomendada: string | null;
}

export const PREFIXO_CATALOGO = "catalogo:";
export const valorCatalogo = (id: string) => `${PREFIXO_CATALOGO}${id}`;
export const catalogoIdDoValor = (valor: string): string | null =>
  valor.startsWith(PREFIXO_CATALOGO) ? valor.slice(PREFIXO_CATALOGO.length) || null : null;

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Chave de comparação de município: sem acento, maiúscula e sem espaços extras. */
export function chaveMunicipio(cidade: string | null | undefined): string {
  return (cidade ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const MINUSCULAS = new Set(["da", "das", "de", "do", "dos", "e"]);

/** "APARECIDA DE GOIÂNIA" → "Aparecida de Goiânia". */
export function formatarMunicipio(cidade: string): string {
  return cidade
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Texto curto da abrangência conhecida: "Pires do Rio e mais 2 cidades". */
export function resumoAbrangencia(item: Pick<SindicatoCatalogo, "municipios" | "uf">, destaque?: string | null): string {
  const nomes = item.municipios.map(formatarMunicipio);
  if (nomes.length === 0) return item.uf ? `Atua em ${item.uf}` : "Abrangência ainda não informada";
  const chaveDestaque = destaque ? chaveMunicipio(destaque) : null;
  const ordenados = chaveDestaque
    ? [...nomes].sort((a, b) => Number(chaveMunicipio(b) === chaveDestaque) - Number(chaveMunicipio(a) === chaveDestaque))
    : nomes;
  if (ordenados.length === 1) return `Atende ${ordenados[0]}`;
  if (ordenados.length === 2) return `Atende ${ordenados[0]} e ${ordenados[1]}`;
  return `Atende ${ordenados[0]} e mais ${ordenados.length - 1} cidades`;
}

/**
 * Sugestões da base para um tipo de sindicato:
 * - some quem a empresa já usa (mesmo vínculo de base ou mesmo CNPJ);
 * - com UF conhecida, mostra só sindicatos dessa UF (ou ainda sem UF);
 * - primeiro quem já atende a cidade, depois os demais, por nome.
 */
export function sugerirSindicatos(params: {
  itens: SindicatoCatalogo[];
  tipo: TipoSindicato;
  locais: LocalSindicato[];
  adotados: SindicatoAdotado[];
}): SugestaoSindicato[] {
  const { itens, tipo, locais, adotados } = params;
  const idsAdotados = new Set(adotados.map((a) => a.catalogo_id).filter(Boolean) as string[]);
  const cnpjsAdotados = new Set(adotados.map((a) => digitos(a.cnpj)).filter((c) => c.length === 14));
  const ufs = new Set(locais.map((l) => (l.uf ?? "").trim().toUpperCase()).filter((u) => /^[A-Z]{2}$/.test(u)));
  const cidades = locais
    .map((l) => ({ chave: chaveMunicipio(l.cidade), uf: (l.uf ?? "").trim().toUpperCase(), nome: l.cidade ?? "" }))
    .filter((c) => c.chave);

  return itens
    .filter((i) => i.tipo === tipo)
    .filter((i) => !idsAdotados.has(i.id) && !(i.cnpj && cnpjsAdotados.has(digitos(i.cnpj))))
    .filter((i) => ufs.size === 0 || !i.uf || ufs.has(i.uf))
    .map((item) => {
      const chaves = new Set(item.municipios.map(chaveMunicipio));
      const cidade = cidades.find((c) => chaves.has(c.chave) && (!item.uf || !c.uf || c.uf === item.uf));
      return {
        item,
        recomendado: !!cidade,
        cidadeRecomendada: cidade ? formatarMunicipio(cidade.nome) : null,
      };
    })
    .sort((a, b) => Number(b.recomendado) - Number(a.recomendado) || a.item.nome.localeCompare(b.item.nome, "pt-BR"));
}

export interface CargoEnquadravel {
  id: string;
  nome: string;
  ativo?: boolean | null;
}

export interface VinculoCargoSindicato {
  cargo_id: string;
  sindicato_id: string;
}

/**
 * Cargos ativos sem nenhum sindicato laboral (mesma regra de
 * `dp_sindicato_vincular_cargos_sem_laboral`): qualquer vínculo laboral, mesmo
 * de sindicato inativo, conta como enquadrado — nunca trocamos vínculo existente.
 */
export function cargosSemLaboral(
  cargos: CargoEnquadravel[],
  vinculos: VinculoCargoSindicato[],
  laboralIds: Iterable<string>,
): CargoEnquadravel[] {
  const laborais = new Set(laboralIds);
  const enquadrados = new Set(vinculos.filter((v) => laborais.has(v.sindicato_id)).map((v) => v.cargo_id));
  return cargos.filter((c) => c.ativo !== false && !enquadrados.has(c.id));
}

export interface SindicatoDaEmpresa {
  id: string;
  tipo?: string | null;
  ativo?: boolean | null;
  catalogo_id?: string | null;
}

/**
 * Laboral que já vem marcado no lote de fichas: o único sindicato laboral da
 * empresa que atende a cidade da unidade pela base; sem cidade conhecida ou sem
 * atendimento pela base, o único laboral ativo da empresa. Com dois ou mais
 * candidatos, nada é escolhido sozinho.
 */
export function laboralPadraoDaUnidade(params: {
  sindicatos: SindicatoDaEmpresa[];
  catalogo: Pick<SindicatoCatalogo, "id" | "uf" | "municipios">[];
  local: LocalSindicato;
  /** Mesmo critério para o patronal da unidade; padrão: laboral. */
  tipo?: TipoSindicato;
}): string | null {
  const tipo = params.tipo ?? "laboral";
  const laborais = params.sindicatos.filter((s) => s.tipo === tipo && s.ativo !== false);
  if (laborais.length === 0) return null;
  const cidade = chaveMunicipio(params.local.cidade);
  const uf = (params.local.uf ?? "").trim().toUpperCase();
  if (cidade) {
    const porId = new Map(params.catalogo.map((c) => [c.id, c]));
    const atendem = laborais.filter((s) => {
      const c = s.catalogo_id ? porId.get(s.catalogo_id) : undefined;
      if (!c) return false;
      if (c.uf && uf && c.uf !== uf) return false;
      return c.municipios.some((m) => chaveMunicipio(m) === cidade);
    });
    if (atendem.length === 1) return atendem[0].id;
    if (atendem.length > 1) return null;
  }
  return laborais.length === 1 ? laborais[0].id : null;
}
