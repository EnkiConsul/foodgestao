import { feriadosDoAno, FERIADOS_MOVEIS, type FeriadoRegra } from "./feriados";

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
  return {
    cadastrados: regras.length,
    ativos: regras.filter((f) => f.ativo !== false).length,
    noAno: feriadosDoAno(regras, ano).length,
  };
}