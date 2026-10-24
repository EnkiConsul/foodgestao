import { dataDoFeriadoNoAno, type FeriadoRegra } from "./feriados";

/** Cadastro mantém regras inativas e de outros anos sem misturá-las à agenda do ano. */
export function ordenarFeriadosCadastro(regras: FeriadoRegra[], ano: number): FeriadoRegra[] {
  return [...regras].sort((a, b) => {
    const dataA = dataDoFeriadoNoAno(a, ano);
    const dataB = dataDoFeriadoNoAno(b, ano);
    if (dataA && dataB) return dataA.localeCompare(dataB) || a.nome.localeCompare(b.nome, "pt-BR");
    if (dataA) return -1;
    if (dataB) return 1;
    return (a.data ?? `${ano}-${String(a.mes ?? 99).padStart(2, "0")}-${String(a.dia ?? 99).padStart(2, "0")}`)
      .localeCompare(b.data ?? `${ano}-${String(b.mes ?? 99).padStart(2, "0")}-${String(b.dia ?? 99).padStart(2, "0")}`)
      || a.nome.localeCompare(b.nome, "pt-BR");
  });
}