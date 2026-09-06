/**
 * Tradução dos motivos de inelegibilidade devolvidos pelo banco
 * (`dp_convocacao_avaliar_candidato`) para texto que o gestor entende.
 */

export interface ContextoMotivo {
  /** Janela habitual da pessoa no dia ("16:30–00:20"). */
  jornada?: string | null;
  /** Janela pedida na necessidade ("16:30–00:35"). */
  necessidade?: string | null;
}

/** Motivos que somem quando a convocação passa a usar o horário informado. */
export const MOTIVOS_DE_HORARIO = new Set([
  "COMPATIBILIDADE_INCOMPATIVEL",
  "SEM_JORNADA_NA_DATA",
  "HORARIO_INDEFINIDO",
]);

export function textoDoMotivo(motivo: string | null | undefined, ctx: ContextoMotivo = {}): string {
  const jornada = ctx.jornada ?? null;
  const necessidade = ctx.necessidade ?? null;

  switch (motivo) {
    case null:
    case undefined:
    case "":
      return "Pode receber a convocação.";
    case "COMPATIBILIDADE_INCOMPATIVEL":
      return jornada && necessidade
        ? `O horário habitual dela (${jornada}) não cobre o horário pedido (${necessidade}).`
        : "O horário habitual dela não cobre o horário pedido.";
    case "SEM_JORNADA_NA_DATA":
      return "Ela não tem horário habitual cadastrado nesse dia da semana.";
    case "HORARIO_INDEFINIDO":
      return "O horário da convocação está incompleto.";
    case "JA_CONVOCADO_NA_DATA":
      return "Ela já tem convocação nesse dia.";
    case "ALOCADO_EM_ESCALA":
      return "Ela já está escalada nesse dia.";
    case "INDISPONIVEL_NA_DATA":
      return "Ela marcou indisponibilidade nesse dia.";
    case "CARGO_DIFERENTE":
      return "O cargo dela é diferente do cargo desse dia.";
    case "OUTRA_UNIDADE":
      return "Ela está em outra unidade.";
    case "COLABORADOR_INATIVO":
      return "O cadastro dela está inativo.";
    case "COLABORADOR_FORA_DA_EMPRESA":
    case "COLABORADOR_INEXISTENTE":
      return "Cadastro não encontrado nesta empresa.";
    case "REGIME_NAO_CONVOCAVEL":
      return "O vínculo dela não é por convocação.";
    case "CARGA_INVALIDA":
      return "A duração do turno ficou zerada — revise entrada, saída e intervalo.";
    case "REMUNERACAO_AUSENTE":
    case "SEM_VALOR_HORA":
    case "SEM_VALOR_DIARIA":
      return "Falta cadastrar o valor por hora ou por diária dela.";
    case "OCORRENCIA_INEXISTENTE":
      return "Esse dia não existe mais no rascunho.";
    default:
      return "Não está apta a receber a convocação.";
  }
}

/** Mensagem amigável para os erros que a publicação pode devolver. */
export function textoDoErroDePublicacao(mensagem: string): string {
  const msg = String(mensagem ?? "");
  const data = /(\d{4}-\d{2}-\d{2})/.exec(msg)?.[1] ?? null;
  const dia = data
    ? ` em ${new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
    : "";

  if (msg.includes("PUBLICATION_NO_RECIPIENTS")) {
    return "Nenhuma pessoa selecionada — a convocação não foi enviada a ninguém.";
  }
  if (msg.includes("COMPATIBILIDADE_INCOMPATIVEL")) {
    return `O horário habitual da pessoa não cobre o horário pedido${dia}. Use o horário informado para todos ou ajuste a janela.`;
  }
  if (msg.includes("SEM_JORNADA_NA_DATA")) {
    return `A pessoa não tem horário habitual nesse dia${dia}. Informe o horário da convocação.`;
  }
  if (msg.includes("JA_CONVOCADO_NA_DATA") || msg.includes("PUBLICATION_OPTION_A")) {
    return `A pessoa já tem convocação${dia}.`;
  }
  if (msg.includes("ALOCADO_EM_ESCALA")) {
    return `A pessoa já está escalada${dia}.`;
  }
  if (msg.includes("REMUNERACAO_AUSENTE") || msg.includes("SEM_VALOR_HORA") || msg.includes("SEM_VALOR_DIARIA")) {
    return "Falta cadastrar o valor por hora ou por diária da pessoa convocada.";
  }
  if (msg.includes("PUBLICATION_TARGET_INELIGIBLE") || msg.includes("PUBLICATION_NO_ELIGIBLE")) {
    return `Ninguém está apto a receber a convocação${dia}. Revise horário, unidade, cargo e conflitos do dia.`;
  }
  if (msg.includes("OFFER_ALREADY_STARTED") || msg.includes("OCCURRENCE_ALREADY_STARTED")) {
    return `O horário${dia} já começou e não pode mais ser publicado.`;
  }
  if (msg.includes("ANTECEDENCE_JUSTIFICATION_REQUIRED")) {
    return "Escreva a justificativa da exceção para publicar em cima da hora.";
  }
  if (msg.includes("ANTECEDENCE_CONFIRMATION_REQUIRED")) {
    return `A convocação${dia} é em cima da hora: marque \"Estou ciente e quero publicar mesmo assim\" para continuar.`;
  }
  if (msg.includes("CONCURRENT_MODIFICATION")) {
    return "O rascunho foi alterado por outra pessoa. Reabra e tente novamente.";
  }
  if (msg.includes("OPEN_CALL_NOT_ALLOWED")) {
    return "As regras da unidade não permitem convocação aberta.";
  }
  return msg || "Não foi possível publicar a convocação.";
}
