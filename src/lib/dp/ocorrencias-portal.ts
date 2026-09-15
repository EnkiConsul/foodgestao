import type { OcorrenciaMarcacao, OcorrenciaTipo } from "@/lib/dp/ocorrencias";

/** Opções que o colaborador pode relatar no portal. */
export type PortalOpcaoId =
  | "atraso"
  | "falta"
  | "saida_antecipada"
  | "esquecimento"
  | "problema_ponto"
  | "atestado"
  | "outro";

/** Momento do expediente em que o fato aconteceu. */
export type PortalMomentoId = "entrada" | "intervalo_inicio" | "intervalo_retorno" | "saida" | "outro";

export type PortalQuando = "ocorrido" | "previsto";

export type PortalOpcao = {
  id: PortalOpcaoId;
  label: string;
  descricao: string;
  /** Só aparece em unidade com relógio de ponto cadastrado. */
  exigePonto: boolean;
  /** Pergunta se já aconteceu ou ainda vai acontecer. */
  pedeQuando: boolean;
  /** Pergunta o momento do expediente. */
  pedeMomento: boolean;
  /** Pede o horário do fato. */
  pedeHorario: boolean;
  /** Justificativa obrigatória independente do momento escolhido. */
  justificativaObrigatoria: boolean;
  /** Permite anexar arquivo (atestado). */
  pedeArquivo: boolean;
};

export const PORTAL_OPCOES: PortalOpcao[] = [
  {
    id: "atraso",
    label: "Atraso",
    descricao: "Cheguei ou vou chegar depois do horário",
    exigePonto: false,
    pedeQuando: true,
    pedeMomento: true,
    pedeHorario: true,
    justificativaObrigatoria: false,
    pedeArquivo: false,
  },
  {
    id: "falta",
    label: "Falta",
    descricao: "Não trabalhei ou não vou trabalhar hoje",
    exigePonto: false,
    pedeQuando: true,
    pedeMomento: false,
    pedeHorario: false,
    justificativaObrigatoria: true,
    pedeArquivo: false,
  },
  {
    id: "saida_antecipada",
    label: "Saída antecipada",
    descricao: "Saí ou vou sair antes do fim do expediente",
    exigePonto: false,
    pedeQuando: true,
    pedeMomento: false,
    pedeHorario: true,
    justificativaObrigatoria: false,
    pedeArquivo: false,
  },
  {
    id: "esquecimento",
    label: "Esquecimento de marcação",
    descricao: "Trabalhei, mas esqueci de registrar o ponto",
    exigePonto: true,
    pedeQuando: false,
    pedeMomento: true,
    pedeHorario: true,
    justificativaObrigatoria: false,
    pedeArquivo: false,
  },
  {
    id: "problema_ponto",
    label: "Problema no relógio de ponto",
    descricao: "Tentei registrar, mas o relógio não aceitou",
    exigePonto: true,
    pedeQuando: false,
    pedeMomento: true,
    pedeHorario: true,
    justificativaObrigatoria: false,
    pedeArquivo: false,
  },
  {
    id: "atestado",
    label: "Atestado",
    descricao: "Ausência com atestado — anexe a foto ou o PDF",
    exigePonto: false,
    pedeQuando: false,
    pedeMomento: false,
    pedeHorario: false,
    justificativaObrigatoria: false,
    pedeArquivo: true,
  },
  {
    id: "outro",
    label: "Outro",
    descricao: "Situação diferente das anteriores",
    exigePonto: false,
    pedeQuando: false,
    pedeMomento: false,
    pedeHorario: true,
    justificativaObrigatoria: true,
    pedeArquivo: false,
  },
];

export const PORTAL_MOMENTOS: { id: PortalMomentoId; label: string }[] = [
  { id: "entrada", label: "Entrada do expediente" },
  { id: "intervalo_inicio", label: "Saída para o intervalo" },
  { id: "intervalo_retorno", label: "Retorno do intervalo" },
  { id: "saida", label: "Saída do expediente" },
  { id: "outro", label: "Outro" },
];

/** Opções visíveis: relógio de ponto só quando a unidade tem. */
export function opcoesDisponiveis(usaPonto: boolean): PortalOpcao[] {
  return PORTAL_OPCOES.filter((o) => !o.exigePonto || usaPonto);
}

export function opcaoPortal(id: PortalOpcaoId): PortalOpcao {
  return PORTAL_OPCOES.find((o) => o.id === id) ?? PORTAL_OPCOES[0];
}

/** Frases claras para "já aconteceu" x "ainda vai acontecer". */
export function frasesQuando(id: PortalOpcaoId): { ocorrido: string; previsto: string } {
  switch (id) {
    case "atraso":
      return { ocorrido: "Já cheguei atrasado", previsto: "Vou chegar atrasado hoje" };
    case "falta":
      return { ocorrido: "Já faltei hoje", previsto: "Não vou conseguir trabalhar hoje" };
    case "saida_antecipada":
      return { ocorrido: "Já saí antes do horário", previsto: "Vou sair antes do horário hoje" };
    default:
      return { ocorrido: "Já aconteceu", previsto: "Ainda vai acontecer" };
  }
}

/** Marcação do enum correspondente ao momento ("Outro" não tem marcação). */
export function marcacaoDoMomento(momento: PortalMomentoId | null): OcorrenciaMarcacao | null {
  if (!momento || momento === "outro") return null;
  return momento;
}

/** Tipo de ocorrência a registrar, sem criar valores novos de enum. */
export function tipoOcorrenciaPortal(
  id: PortalOpcaoId,
  quando: PortalQuando,
  momento: PortalMomentoId | null,
): OcorrenciaTipo {
  const previsto = quando === "previsto";
  switch (id) {
    case "atraso":
      if (momento === "intervalo_retorno") return previsto ? "previsao_atraso_intervalo" : "atraso_intervalo";
      return previsto ? "previsao_atraso" : "atraso";
    case "falta":
      return previsto ? "previsao_falta" : "falta";
    case "saida_antecipada":
      return previsto ? "previsao_saida_antecipada" : "saida_antecipada";
    case "esquecimento":
      return "esquecimento_marcacao";
    case "atestado":
      return "atestado";
    case "problema_ponto":
    case "outro":
    default:
      return "divergencia_jornada";
  }
}

/** Justificativa é obrigatória na opção "Outro" e no momento "Outro". */
export function exigeJustificativa(id: PortalOpcaoId, momento: PortalMomentoId | null): boolean {
  const opcao = opcaoPortal(id);
  if (opcao.justificativaObrigatoria) return true;
  return opcao.pedeMomento && momento === "outro";
}
