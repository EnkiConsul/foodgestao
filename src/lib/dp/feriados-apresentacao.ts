import { categoriaFeriado, feriadosDoAno, FERIADOS_MOVEIS, FERIADO_CATEGORIA_LABEL, type FeriadoCategoria, type FeriadoRegra } from "./feriados";

export const FERIADOS_MOVEIS_LABEL = {
  ...FERIADOS_MOVEIS,
  sexta_feira_santa: { ...FERIADOS_MOVEIS.sexta_feira_santa, nome: "Sexta-feira da Paixão" },
};

/** Padroniza a apresentação sem regravar os cadastros existentes. */
export function nomeFeriado(f: FeriadoRegra): string {
  if (f.tipo === "movel" && f.codigo_movel) return FERIADOS_MOVEIS_LABEL[f.codigo_movel].nome;
  return f.nome.replace(/sexta-feira santa/gi, "Sexta-feira da Paixão");
}

export function resumoFeriados(regras: FeriadoRegra[], ano: number) {
  const categorias: Record<FeriadoCategoria, number> = { nacional: 0, estadual: 0, municipal: 0, sindicato: 0 };
  for (const regra of regras) categorias[categoriaFeriado(regra)]++;
  return {
    categorias,
    cadastrados: regras.length,
    ativos: regras.filter((f) => f.ativo !== false).length,
    noAno: feriadosDoAno(regras, ano).length,
  };
}

export type FeriadoDia = { nome: string; categoria: FeriadoCategoria };
export function agruparFeriadosDia(linhas: (FeriadoDia & { data: string; unidade_id: string })[], unidadeId: string | null, unidadesAtivas: string[]) {
  const grupos = new Map<string, { itens: FeriadoDia[]; unidades: Set<string> }>();
  for (const linha of linhas) {
    const grupo = grupos.get(linha.data) ?? { itens: [], unidades: new Set<string>() };
    grupo.unidades.add(linha.unidade_id);
    const nome = linha.nome.replace(/sexta-feira santa/gi, "Sexta-feira da Paixão");
    if (!grupo.itens.some((f) => f.nome === nome && f.categoria === linha.categoria)) grupo.itens.push({ nome, categoria: linha.categoria });
    grupos.set(linha.data, grupo);
  }
  return new Map([...grupos].filter(([, g]) => unidadeId || (unidadesAtivas.length > 0 && unidadesAtivas.every((id) => g.unidades.has(id)))).map(([data, g]) => [data, g.itens]));
}
export function textoFeriadosDia(dia: { feriado_nome: string | null; feriados?: FeriadoDia[] }): string {
  return dia.feriados?.length
    ? dia.feriados.map((f) => `Feriado ${FERIADO_CATEGORIA_LABEL[f.categoria]} · ${f.nome}`).join("; ")
    : dia.feriado_nome?.replace(/sexta-feira santa/gi, "Sexta-feira da Paixão") ?? "";
}