/**
 * Uso de um turno: consolida em quantos lugares o horário está referenciado.
 * A fonte é a função dp_turnos_uso, que conta os vínculos por origem.
 */
export interface TurnoUsoRow {
  turno_id: string;
  colaboradores_padrao: number;
  config_dias: number;
  escala_itens_publicados: number;
  escala_itens_rascunho: number;
  convocacoes: number;
  cobertura_minima: number;
  versoes: number;
}

export type TurnoUsoMap = Record<string, TurnoUsoRow>;

export const TURNO_USO_VAZIO: Omit<TurnoUsoRow, "turno_id"> = {
  colaboradores_padrao: 0,
  config_dias: 0,
  escala_itens_publicados: 0,
  escala_itens_rascunho: 0,
  convocacoes: 0,
  cobertura_minima: 0,
  versoes: 0,
};

export interface TurnoUsoDetalhe {
  rotulo: string;
  quantidade: number;
}

/** Total de vínculos do turno (inclui versões derivadas). */
export function totalUsoTurno(uso?: TurnoUsoRow | null): number {
  if (!uso) return 0;
  return (
    uso.colaboradores_padrao +
    uso.config_dias +
    uso.escala_itens_publicados +
    uso.escala_itens_rascunho +
    uso.convocacoes +
    uso.cobertura_minima +
    uso.versoes
  );
}

/** Detalhamento por origem, apenas com o que tem quantidade maior que zero. */
export function detalhesUsoTurno(uso?: TurnoUsoRow | null): TurnoUsoDetalhe[] {
  if (!uso) return [];
  const itens: TurnoUsoDetalhe[] = [
    { rotulo: "Colaboradores com este turno padrão", quantidade: uso.colaboradores_padrao },
    { rotulo: "Dias na configuração de trabalho", quantidade: uso.config_dias },
    { rotulo: "Itens de escala publicada", quantidade: uso.escala_itens_publicados },
    { rotulo: "Itens de escala em rascunho", quantidade: uso.escala_itens_rascunho },
    { rotulo: "Convocações", quantidade: uso.convocacoes },
    { rotulo: "Cobertura mínima", quantidade: uso.cobertura_minima },
    { rotulo: "Versões derivadas deste turno", quantidade: uso.versoes },
  ];
  return itens.filter((i) => i.quantidade > 0);
}

export type TurnoUsoEstado =
  | "carregando"
  | "indisponivel"
  | "sem_uso"
  | "em_uso"
  | "versao_historica";

/**
 * Estado do turno para a tela: versão histórica (é origem de outra versão ou
 * já tem sucessora) nunca deve ser excluída, apenas mantida inativa.
 */
export function estadoUsoTurno(params: {
  uso?: TurnoUsoRow | null;
  carregando?: boolean;
  erro?: boolean;
  ehVersaoHistorica?: boolean;
}): TurnoUsoEstado {
  if (params.carregando) return "carregando";
  if (params.erro) return "indisponivel";
  const total = totalUsoTurno(params.uso);
  if (params.ehVersaoHistorica || (params.uso?.versoes ?? 0) > 0) return "versao_historica";
  return total > 0 ? "em_uso" : "sem_uso";
}

/** Colaboradores vinculados de forma fixa (turno padrão + dias da configuração). */
export function pessoasVinculadasTurno(uso?: TurnoUsoRow | null): number {
  if (!uso) return 0;
  return uso.colaboradores_padrao + uso.config_dias;
}

/** Rótulo curto exibido no selo do card. */
export function rotuloUsoTurno(estado: TurnoUsoEstado, uso?: TurnoUsoRow | null): string {
  switch (estado) {
    case "carregando":
      return "Verificando uso…";
    case "indisponivel":
      return "Uso indisponível";
    case "versao_historica":
      return "Versão histórica";
    case "em_uso": {
      const pessoas = pessoasVinculadasTurno(uso);
      return pessoas > 0
        ? `Em uso · ${pessoas} colaborador${pessoas > 1 ? "es" : ""}`
        : `Em uso: ${totalUsoTurno(uso)}`;
    }
    default:
      return "Sem uso";
  }
}


/** Só é seguro excluir turno sem nenhum vínculo e que não seja versão histórica. */
export function podeExcluirTurno(estado: TurnoUsoEstado): boolean {
  return estado === "sem_uso";
}

/** Motivo humano do bloqueio de exclusão — usado no tooltip e no toast. */
export function motivoBloqueioExclusao(estado: TurnoUsoEstado, uso?: TurnoUsoRow | null): string | null {
  if (estado === "sem_uso") return null;
  if (estado === "carregando") return "Aguarde a verificação de uso do turno.";
  if (estado === "indisponivel") {
    return "Não foi possível verificar o uso deste turno agora. Tente novamente antes de excluir.";
  }
  if (estado === "versao_historica") {
    return "Este turno faz parte do histórico de versões. Desative em vez de excluir.";
  }
  const detalhes = detalhesUsoTurno(uso)
    .map((d) => `${d.quantidade} em ${d.rotulo.toLowerCase()}`)
    .join(", ");
  return `Turno em uso (${detalhes}). Desative em vez de excluir.`;
}
