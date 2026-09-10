// ------------------------------------------------------------------
// Domínio: DP → participação do sócio em mais de uma unidade.
//
// O sócio tem uma unidade principal (dp_colaboradores.unidade_id) e pode
// participar de outras sociedades da mesma empresa. Em cada unidade o setor
// habitual, o horário e o pró-labore podem ser diferentes; o que ficar em
// branco herda a unidade principal. Funções puras — sem React, sem Supabase.
// ------------------------------------------------------------------

export interface HorarioUnidade {
  dow: number;
  trabalha: boolean;
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
}

/** Linha de participação societária (dp_apoio_unidades com socio = true). */
export interface ParticipacaoSocio {
  id?: string;
  unidade_id: string;
  setor_id?: string | null;
  cargo_id?: string | null;
  pro_labore?: number | string | null;
  horario?: HorarioUnidade[] | null;
  ativo?: boolean;
}

/** Condições da unidade principal, usadas como herança. */
export interface BaseSocio {
  unidade_id?: string | null;
  setor_id?: string | null;
  cargo_id?: string | null;
  pro_labore?: number | string | null;
  horario?: HorarioUnidade[] | null;
}

export interface CondicoesSocioUnidade {
  unidade_id: string;
  setor_id: string | null;
  cargo_id: string | null;
  pro_labore: number | null;
  horario: HorarioUnidade[] | null;
  /** Cada campo veio da própria unidade ou foi herdado da principal. */
  herdado: { setor: boolean; cargo: boolean; pro_labore: boolean; horario: boolean };
  principal: boolean;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const vazio = (v: unknown): boolean => v === null || v === undefined || v === "";

/** Participações ativas do sócio, sem a unidade principal duplicada. */
export function participacoesAtivas(
  linhas: ParticipacaoSocio[] | null | undefined,
  unidadePrincipal?: string | null,
): ParticipacaoSocio[] {
  return (linhas ?? []).filter(
    (l) => l.ativo !== false && !!l.unidade_id && l.unidade_id !== unidadePrincipal,
  );
}

/** Condições do sócio numa unidade, com herança da unidade principal. */
export function condicoesNaUnidade(
  unidadeId: string,
  base: BaseSocio,
  linhas: ParticipacaoSocio[] | null | undefined,
): CondicoesSocioUnidade {
  const principal = !!base.unidade_id && base.unidade_id === unidadeId;
  const linha = principal
    ? null
    : (linhas ?? []).find((l) => l.unidade_id === unidadeId && l.ativo !== false) ?? null;

  const setorPropio = !principal && linha ? !vazio(linha.setor_id) : principal;
  const cargoProprio = !principal && linha ? !vazio(linha.cargo_id) : principal;
  const proLaboreProprio = !principal && linha ? numero(linha.pro_labore) != null : principal;
  const horarioProprio = !principal && linha ? (linha.horario?.length ?? 0) > 0 : principal;

  return {
    unidade_id: unidadeId,
    setor_id: (setorPropio ? linha?.setor_id ?? base.setor_id : base.setor_id) ?? null,
    cargo_id: (cargoProprio ? linha?.cargo_id ?? base.cargo_id : base.cargo_id) ?? null,
    pro_labore: proLaboreProprio ? numero(linha?.pro_labore) ?? numero(base.pro_labore) : numero(base.pro_labore),
    horario: (horarioProprio ? linha?.horario ?? base.horario : base.horario) ?? null,
    herdado: {
      setor: !setorPropio,
      cargo: !cargoProprio,
      pro_labore: !proLaboreProprio,
      horario: !horarioProprio,
    },
    principal,
  };
}

/** Todas as unidades do sócio (principal primeiro), já com as condições. */
export function condicoesDoSocio(
  base: BaseSocio,
  linhas: ParticipacaoSocio[] | null | undefined,
): CondicoesSocioUnidade[] {
  const out: CondicoesSocioUnidade[] = [];
  if (base.unidade_id) out.push(condicoesNaUnidade(base.unidade_id, base, linhas));
  for (const l of participacoesAtivas(linhas, base.unidade_id)) {
    out.push(condicoesNaUnidade(l.unidade_id, base, linhas));
  }
  return out;
}

/** Soma do pró-labore do sócio em todas as unidades. */
export function proLaboreTotal(
  base: BaseSocio,
  linhas: ParticipacaoSocio[] | null | undefined,
): number {
  return condicoesDoSocio(base, linhas).reduce((acc, c) => acc + (c.pro_labore ?? 0), 0);
}
