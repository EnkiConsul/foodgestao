/**
 * Quais cargos oferecer quando o gestor escolhe uma unidade.
 *
 * Regra de ouro: a lista nunca fica vazia sem explicação. Se os vínculos da
 * unidade não puderam ser lidos, ainda não terminaram de carregar ou não
 * resultam em nenhum cargo visível, cai para todos os cargos da empresa com o
 * aviso correspondente — o convite de pré-admissão não trava por configuração.
 */

export type MotivoListaCargos =
  | "carregando"
  | "sem_unidade"
  | "sem_cargos_empresa"
  | "vinculo"
  | "sem_vinculo"
  | "vinculo_indisponivel"
  | "erro";

export interface EntradaListaCargos<T extends CargoBasico> {
  /** Cargos ativos da empresa selecionada. */
  cargosEmpresa: T[];
  /** Ids vinculados à unidade (dp_unidade_cargos). */
  vinculados: string[];
  unidadeId: string | null;
  carregandoVinculos: boolean;
  carregandoCargos: boolean;
  erro: boolean;
}

export interface ListaCargos<T extends { id: string }> {
  cargos: T[];
  motivo: MotivoListaCargos;
  /** Mensagem a exibir sob o campo (vazio = nada a dizer). */
  aviso: string;
}

export function listaCargosDaUnidade<T extends { id: string }>(
  e: EntradaListaCargos<T>,
): ListaCargos<T> {
  if (!e.unidadeId) {
    return { cargos: [], motivo: "sem_unidade", aviso: "" };
  }
  if (e.erro) {
    return {
      cargos: e.cargosEmpresa,
      motivo: "erro",
      aviso:
        "Não conseguimos conferir os cargos desta unidade agora: a lista mostra todos os cargos da empresa.",
    };
  }
  if (e.carregandoCargos || e.carregandoVinculos) {
    return { cargos: [], motivo: "carregando", aviso: "Carregando cargos…" };
  }
  if (e.cargosEmpresa.length === 0) {
    return {
      cargos: [],
      motivo: "sem_cargos_empresa",
      aviso: "Esta empresa ainda não tem cargos cadastrados. Cadastre o cargo para seguir.",
    };
  }
  if (e.vinculados.length === 0) {
    return {
      cargos: e.cargosEmpresa,
      motivo: "sem_vinculo",
      aviso: "Esta unidade ainda não tem cargos vinculados: a lista mostra todos os cargos da empresa.",
    };
  }
  const daUnidade = e.cargosEmpresa.filter((c) => e.vinculados.includes(c.id));
  if (daUnidade.length === 0) {
    return {
      cargos: e.cargosEmpresa,
      motivo: "vinculo_indisponivel",
      aviso:
        "Os cargos vinculados a esta unidade não estão disponíveis: a lista mostra todos os cargos da empresa.",
    };
  }
  return { cargos: daUnidade, motivo: "vinculo", aviso: "" };
}
