// ------------------------------------------------------------------
// Domínio: DP → Isonomia de benefícios
//
// Converte a linha do colaborador (dp_colaboradores + atribuições da tabela de
// benefícios) no formato comparável do motor de isonomia. Fonte única usada
// pelo cadastro e pela lista de colaboradores.
// ------------------------------------------------------------------

import { calcularBeneficioMes, DIAS_BASE_PADRAO, type ColegaIsonomia, type Periodicidade } from "@/lib/dp/beneficios-regras";
import { premioAssiduidadeBase } from "@/lib/dp/remuneracao";

/** Rótulos dos benefícios que vivem no cadastro do colaborador. */
export const BENEFICIO_CADASTRO_LABEL: Record<string, string> = {
  vale_alimentacao: "Vale-alimentação",
  vale_transporte: "Vale-transporte",
  premio_assiduidade: "Prêmio de assiduidade",
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface LinhaColaboradorBeneficios {
  id: string;
  nome?: string | null;
  cargo_id?: string | null;
  unidade_id?: string | null;
  sindicato_id?: string | null;
  salario_base?: number | null;
  base_salarial?: number | null;
  vale_alimentacao?: boolean | null;
  vale_alimentacao_valor?: number | null;
  vale_alimentacao_periodicidade?: string | null;
  vale_alimentacao_dias_base?: number | null;
  vale_transporte?: boolean | null;
  vale_transporte_valor_dia?: number | null;
  premio_assiduidade?: boolean | null;
  premio_assiduidade_valor?: number | null;
  premio_assiduidade_tipo?: string | null;
}

/** Valor mensal do vale-alimentação a partir dos campos do cadastro. */
export function valeAlimentacaoMensal(c: LinhaColaboradorBeneficios): number {
  if (!c.vale_alimentacao) return 0;
  return calcularBeneficioMes({
    valor: num(c.vale_alimentacao_valor),
    periodicidade: (c.vale_alimentacao_periodicidade ?? "mensal") as Periodicidade,
    dias_base: num(c.vale_alimentacao_dias_base) || DIAS_BASE_PADRAO,
  }).bruto;
}

/**
 * Situação de benefícios do colaborador no formato do motor de isonomia.
 *
 * `atribuicoes` cobre os benefícios do catálogo (dp_colaborador_beneficios);
 * VA/VT/assiduidade vêm dos campos do próprio cadastro.
 */
export function snapshotColegaBeneficios(
  c: LinhaColaboradorBeneficios,
  patronalId: string | null,
  atribuicoes?: { colaborador_id: string; beneficio_id: string; ativo?: boolean | null; valor?: number | null }[],
): ColegaIsonomia {
  const salario = num(c.salario_base) || num(c.base_salarial);
  const beneficios: ColegaIsonomia["beneficios"] = {
    vale_alimentacao: {
      ativo: !!c.vale_alimentacao,
      valorMes: valeAlimentacaoMensal(c),
      // Valor como foi cadastrado: comparar diário com diário evita projetar
      // dias no mês, que variam por escala e por convocação.
      valorUnitario: c.vale_alimentacao ? num(c.vale_alimentacao_valor) : 0,
      periodicidade: (c.vale_alimentacao_periodicidade ?? "mensal") as Periodicidade,
    },
    vale_transporte: {
      ativo: !!c.vale_transporte,
      valorMes: c.vale_transporte ? num(c.vale_transporte_valor_dia) * DIAS_BASE_PADRAO : 0,
      valorUnitario: c.vale_transporte ? num(c.vale_transporte_valor_dia) : 0,
      periodicidade: "diario",
    },
    premio_assiduidade: {
      ativo: !!c.premio_assiduidade,
      valorMes: c.premio_assiduidade
        ? premioAssiduidadeBase(
          {
            premio_assiduidade_tipo: c.premio_assiduidade_tipo ?? "valor",
            premio_assiduidade_valor: num(c.premio_assiduidade_valor),
          },
          salario,
        )
        : 0,
      periodicidade: "mensal",
    },
  };

  for (const a of atribuicoes ?? []) {
    if (a.colaborador_id !== c.id) continue;
    beneficios[a.beneficio_id] = {
      ativo: !!a.ativo,
      valorMes: num(a.valor),
      valorUnitario: num(a.valor),
      periodicidade: "mensal",
    };
  }

  return {
    colaborador_id: c.id,
    nome: c.nome ?? "Colaborador",
    cargo_id: c.cargo_id ?? null,
    unidade_id: c.unidade_id ?? null,
    sindicato_id: c.sindicato_id ?? null,
    patronal_id: patronalId,
    beneficios,
  };
}
