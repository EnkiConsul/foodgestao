// ------------------------------------------------------------------
// Domínio: DP → Setor efetivo de uma pessoa numa data
//
// Espelha as funções do banco `dp_setor_previsto` / `dp_setor_previsto_periodo`.
// Precedência: escala PUBLICADA da data → jornada daquele dia da semana →
// setor habitual do cadastro. Quando nada resolve, o resultado é
// "não definido" — nunca existe a categoria "Sem setor".
//
// Funções puras — sem React e sem banco.
// ------------------------------------------------------------------

export type OrigemSetor = "escala" | "config_dia" | "cadastro" | "nenhum";
export type StatusSetor = "ok" | "nao_definido";

export interface SetorPrevisto {
  setor_id: string | null;
  setor_nome: string | null;
  origem: OrigemSetor;
  status: StatusSetor;
  referencia_id: string | null;
}

export const SETOR_NAO_DEFINIDO_LABEL = "Setor não definido";
export const SETOR_NAO_DEFINIDO_AJUDA =
  "Este colaborador está previsto para trabalhar nesta data, mas ainda não possui um setor definido.";
export const SETOR_FOLGA_NAO_DEFINIDO_TITULO = "Setor precisa ser definido";
export const SETOR_FOLGA_NAO_DEFINIDO_AJUDA =
  "Não foi possível determinar o setor deste colaborador nesta data. Defina o setor antes de avaliar regras de folga por setor.";

export const ORIGEM_SETOR_LABEL: Record<OrigemSetor, string> = {
  escala: "escala publicada",
  config_dia: "rotina do dia",
  cadastro: "setor habitual",
  nenhum: "não definido",
};

/** Sufixo discreto mostrado ao lado do nome do setor na leitura do dia a dia. */
export function origemSetorSufixo(origem: OrigemSetor): string | null {
  if (origem === "config_dia") return "rotina do dia";
  if (origem === "escala") return "alterado hoje";
  return null;
}

/** A dimensão Setor só liga quando a unidade tem pelo menos um setor ativo. */
export function dimensaoSetorAtiva(setores: readonly { ativo: boolean }[]): boolean {
  return setores.some((s) => s.ativo);
}

export interface ResolverSetorInput {
  /** Setor gravado no item da escala — considerado somente se publicada. */
  escalaSetorId?: string | null;
  escalaPublicada?: boolean;
  escalaItemId?: string | null;
  /** Setor da jornada para aquele dia da semana. */
  configDiaSetorId?: string | null;
  configDiaId?: string | null;
  /** Setor habitual do cadastro. */
  cadastroSetorId?: string | null;
  /** Nomes por id, para preencher `setor_nome`. */
  nomes?: Readonly<Record<string, string>>;
}

/** Resolve o setor efetivo seguindo a precedência oficial. */
export function resolverSetorPrevisto(input: ResolverSetorInput): SetorPrevisto {
  const nome = (id: string | null) => (id ? (input.nomes?.[id] ?? null) : null);

  if (input.escalaPublicada && input.escalaSetorId) {
    return {
      setor_id: input.escalaSetorId,
      setor_nome: nome(input.escalaSetorId),
      origem: "escala",
      status: "ok",
      referencia_id: input.escalaItemId ?? null,
    };
  }
  if (input.configDiaSetorId) {
    return {
      setor_id: input.configDiaSetorId,
      setor_nome: nome(input.configDiaSetorId),
      origem: "config_dia",
      status: "ok",
      referencia_id: input.configDiaId ?? null,
    };
  }
  if (input.cadastroSetorId) {
    return {
      setor_id: input.cadastroSetorId,
      setor_nome: nome(input.cadastroSetorId),
      origem: "cadastro",
      status: "ok",
      referencia_id: null,
    };
  }
  return { setor_id: null, setor_nome: null, origem: "nenhum", status: "nao_definido", referencia_id: null };
}

/** Rótulo do setor efetivo pronto para a tela. */
export function setorEfetivoLabel(previsto: SetorPrevisto): string {
  return previsto.status === "ok" && previsto.setor_nome
    ? previsto.setor_nome
    : SETOR_NAO_DEFINIDO_LABEL;
}

/** Mensagens amigáveis para os erros de integridade de setor vindos do banco. */
export function traduzirErroSetor(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (msg.includes("SETOR_UNIDADE_INVALIDA"))
    return "Este setor pertence a outra unidade. Escolha um setor da unidade em que a pessoa trabalha nesta data.";
  if (msg.includes("SETOR_EMPRESA_INVALIDA"))
    return "Este setor pertence a outra empresa.";
  if (msg.includes("SETOR_INEXISTENTE")) return "Setor não encontrado.";
  if (msg.includes("SETOR_INATIVO"))
    return "Este setor está inativo e não pode ser usado em novos ajustes.";
  if (msg.includes("SETOR_LIMITE_DUPLICADO"))
    return "Este setor já participa de outro limite específico para este dia.";
  return msg || "Não foi possível concluir a alteração de setor.";
}

/** Aviso de excesso de folga depois de uma alteração de setor. */
export function avisoExcessoFolgaSetor(params: {
  setorNome: string;
  ocupacao: number;
  limite: number;
}): string {
  const pessoas = params.ocupacao === 1 ? "pessoa" : "pessoas";
  return `${params.setorNome} ficará com ${params.ocupacao} ${pessoas} de folga neste dia. O limite configurado é ${params.limite}.`;
}

/** Aviso discreto de vaga liberada quando a regra deixa de estar saturada. */
export function avisoVagaLiberadaSetor(setorNome: string): string {
  return `Uma vaga de folga foi liberada para o setor ${setorNome} nesta data.`;
}
