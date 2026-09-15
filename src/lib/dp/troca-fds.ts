// Regras do pedido de troca da folga fixa do fim de semana, feito pelo próprio
// colaborador no portal. Funções puras — o servidor valida tudo de novo.

export type TrocaFdsEntrada = {
  /** Dias da semana em que a pessoa tem folga fixa (0 = domingo). */
  diasFixos: number[];
  /** Dia de meio de semana que ela quer folgar. */
  diaFolga?: Date;
  /** Dia de folga fixa que ela vai trabalhar em troca. */
  diaTrabalho?: Date;
  motivo: string;
  hoje: Date;
};

const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** A pessoa pode pedir troca? Só quem tem dia fixo de folga na semana. */
export function podePedirTrocaFds(diasFixos: number[]): boolean {
  return diasFixos.length > 0;
}

/** Erros do pedido, na ordem em que devem ser mostrados. */
export function validarTrocaFds(e: TrocaFdsEntrada): string[] {
  const erros: string[] = [];
  if (!podePedirTrocaFds(e.diasFixos)) {
    erros.push("Seu cadastro não tem folga fixa na semana.");
    return erros;
  }
  if (!e.diaFolga) erros.push("Escolha o dia que você quer folgar.");
  if (!e.diaTrabalho) erros.push("Escolha o dia de folga que você vai trabalhar.");
  if (!e.motivo.trim()) erros.push("Escreva o motivo da troca.");
  if (!e.diaFolga || !e.diaTrabalho) return erros;

  const hoje = soData(e.hoje);
  if (soData(e.diaFolga) < hoje || soData(e.diaTrabalho) < hoje)
    erros.push("Não é possível pedir troca em data passada.");
  if (soData(e.diaFolga) === soData(e.diaTrabalho))
    erros.push("Escolha dois dias diferentes.");
  if (!e.diasFixos.includes(e.diaTrabalho.getDay()))
    erros.push("O dia que você vai trabalhar precisa ser um dia de folga fixa sua.");
  if (e.diasFixos.includes(e.diaFolga.getDay()))
    erros.push("Esse dia já é folga fixa sua. Escolha um dia de meio de semana.");
  return erros;
}
