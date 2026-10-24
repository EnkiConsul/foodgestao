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
export function textoFeriadosDia(dia: { feriado_nome: string | null; feriados?: FeriadoDia[] }): string {
  return dia.feriados?.length
    ? dia.feriados.map((f) => `Feriado ${FERIADO_CATEGORIA_LABEL[f.categoria]} · ${f.nome}`).join("; ")
    : dia.feriado_nome?.replace(/sexta-feira santa/gi, "Sexta-feira da Paixão") ?? "";
}