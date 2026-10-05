/**
 * Janela mensal de escolha das folgas.
 *
 * A janela abre e encerra em dias fixos de cada mês (1 a 28) e sempre se refere
 * ao mês SEGUINTE. Fora da janela a marcação normal fica bloqueada e o
 * colaborador só pode pedir exceção. Após o encerramento, quem não escolheu
 * recebe folga de fim de semana pela distribuição automática.
 */

export type EstadoJanela = "antes" | "aberta" | "encerrada" | "inativa";

export interface JanelaConfig {
  /** A janela mensal está em uso na empresa/unidade? */
  ativa: boolean;
  /** Dia do mês em que a marcação abre (1 a 28). */
  abreDia: number;
  /** Dia do mês em que a marcação encerra (1 a 28). */
  fechaDia: number;
}

export interface JanelaResolvida {
  estado: EstadoJanela;
  /** Primeiro dia em que a marcação é permitida. */
  abreEm: Date;
  /** Último dia em que a marcação é permitida. */
  fechaEm: Date;
  /** Primeiro dia do mês-alvo da marcação (sempre o mês seguinte). */
  competencia: Date;
  /** Mês-alvo no formato `YYYY-MM`. */
  competenciaKey: string;
}

const clampDia = (dia: number): number => {
  if (!Number.isFinite(dia)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(dia)));
};

const semHoras = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Chave `YYYY-MM` de uma data. */
export function mesKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Resolve o estado da janela para a data de referência informada. */
export function resolverJanela(cfg: JanelaConfig, hoje: Date): JanelaResolvida {
  const ref = semHoras(hoje);
  const abreDia = clampDia(cfg.abreDia);
  const fechaDia = Math.max(abreDia, clampDia(cfg.fechaDia));

  const abreEm = new Date(ref.getFullYear(), ref.getMonth(), abreDia);
  const fechaEm = new Date(ref.getFullYear(), ref.getMonth(), fechaDia);
  const competencia = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);

  let estado: EstadoJanela;
  if (!cfg.ativa) estado = "inativa";
  else if (ref < abreEm) estado = "antes";
  else if (ref > fechaEm) estado = "encerrada";
  else estado = "aberta";

  return { estado, abreEm, fechaEm, competencia, competenciaKey: mesKey(competencia) };
}

/**
 * O período é apenas o marco INICIAL da escolha:
 * - antes de abrir, a marcação direta fica bloqueada (só exceção);
 * - com o período aberto, a marcação vale para o mês-alvo;
 * - depois de encerrado, o colaborador segue marcando e mudando folgas em datas
 *   futuras (troca e exceção continuam disponíveis do mesmo jeito).
 */
export function podeMarcarNormal(janela: JanelaResolvida, data: Date): boolean {
  if (janela.estado === "inativa") return true;
  if (janela.estado === "antes") return false;
  if (janela.estado === "encerrada") return true;
  return mesKey(data) === janela.competenciaKey;
}

/**
 * Texto curto do estado da janela para o colaborador. Só aparece no mês
 * anterior ao mês-alvo, antes e durante a escolha; depois de encerrada, some.
 */
export function mensagemJanela(janela: JanelaResolvida, formatar: (d: Date) => string): string {
  if (janela.estado !== "antes" && janela.estado !== "aberta") return "";
  const mesNome = janela.competencia.toLocaleDateString("pt-BR", { month: "long" });
  const alvo = `${mesNome.charAt(0).toUpperCase()}${mesNome.slice(1)}/${janela.competencia.getFullYear()}`;
  const curta = (d: Date) => formatar(d).slice(0, 5);
  return `A escolha das folgas de ${alvo} é liberada em ${curta(janela.abreEm)} e finaliza em ${curta(janela.fechaEm)}.`;
}

// ---------------------------------------------------------------------------
// Distribuição automática após o encerramento
// ---------------------------------------------------------------------------

export interface CandidatoAuto {
  colaboradorId: string;
  /** Quantas folgas de fim de semana ainda faltam para este colaborador. */
  faltam: number;
}

export interface DiaCandidato {
  data: string;
  /** Quantas pessoas já estão de folga neste dia (grupo do colaborador). */
  ocupacao: number;
  /** Limite de pessoas; `null` significa dia sem limite definido. */
  limite: number | null;
}

export interface AtribuicaoAuto {
  colaboradorId: string;
  data: string;
  /** Passou do limite por não haver mais vaga no mês (registrado em auditoria). */
  excedido: boolean;
  limite: number | null;
  ocupacaoAnterior: number;
}

/**
 * Distribui as folgas de quem não escolheu.
 *
 * Prioridade: (1) dias ainda vazios, (2) dias com menor ocupação que tenham
 * vaga, (3) quando tudo está lotado, começa pelos ÚLTIMOS dias do mês e marca
 * o excesso — regra de conveniência de negócio das folgas, específica deste
 * fluxo.
 */
export function distribuirFolgasAutomaticas(
  candidatos: CandidatoAuto[],
  dias: DiaCandidato[],
): AtribuicaoAuto[] {
  const ocupacao = new Map(dias.map((d) => [d.data, d.ocupacao]));
  const limites = new Map(dias.map((d) => [d.data, d.limite]));
  const ordenados = [...dias].map((d) => d.data).sort((a, b) => a.localeCompare(b));
  const resultado: AtribuicaoAuto[] = [];

  const temVaga = (data: string): boolean => {
    const limite = limites.get(data) ?? null;
    if (limite == null) return true;
    return (ocupacao.get(data) ?? 0) < limite;
  };

  for (const candidato of candidatos) {
    const usados = new Set<string>();
    for (let i = 0; i < Math.max(0, candidato.faltam); i += 1) {
      const disponiveis = ordenados.filter((d) => !usados.has(d));
      if (disponiveis.length === 0) break;

      let escolhida: string | null = null;
      let excedido = false;

      const vazio = disponiveis.find((d) => (ocupacao.get(d) ?? 0) === 0 && temVaga(d));
      if (vazio) {
        escolhida = vazio;
      } else {
        const comVaga = disponiveis.filter(temVaga);
        if (comVaga.length > 0) {
          escolhida = comVaga.reduce((melhor, atual) =>
            (ocupacao.get(atual) ?? 0) < (ocupacao.get(melhor) ?? 0) ? atual : melhor,
          );
        } else {
          escolhida = disponiveis[disponiveis.length - 1];
          excedido = true;
        }
      }

      if (!escolhida) break;
      const anterior = ocupacao.get(escolhida) ?? 0;
      resultado.push({
        colaboradorId: candidato.colaboradorId,
        data: escolhida,
        excedido,
        limite: limites.get(escolhida) ?? null,
        ocupacaoAnterior: anterior,
      });
      ocupacao.set(escolhida, anterior + 1);
      usados.add(escolhida);
    }
  }

  return resultado;
}

/** Dias de fim de semana do mês que podem receber folga automática. */
export function diasFdsDoMes(competencia: Date, diasSemana: number[]): string[] {
  const ano = competencia.getFullYear();
  const mes = competencia.getMonth();
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const out: string[] = [];
  for (let dia = 1; dia <= ultimo; dia += 1) {
    const d = new Date(ano, mes, dia);
    if (diasSemana.includes(d.getDay())) {
      out.push(`${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
    }
  }
  return out;
}
