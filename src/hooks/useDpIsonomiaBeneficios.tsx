import { useMemo } from "react";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpBeneficios } from "@/hooks/useDpBeneficios";
import { useDpPatronalPorUnidade, useDpSindicatos } from "@/hooks/useDpCadastros";
import {
  divergenciasIsonomia,
  type BeneficioAlvoIsonomia,
  type ColegaIsonomia,
  type DivergenciaIsonomia,
} from "@/lib/dp/beneficios-regras";
import {
  BENEFICIO_CADASTRO_LABEL,
  snapshotColegaBeneficios,
  type LinhaColaboradorBeneficios,
} from "@/lib/dp/isonomia-snapshot";

/**
 * Benefícios do cadastro avaliados por isonomia. Só o vale-alimentação compara
 * valor: VT e assiduidade variam por endereço e por regra própria.
 */
export function itensIsonomiaDoCadastro(c: LinhaColaboradorBeneficios): BeneficioAlvoIsonomia[] {
  const snap = snapshotColegaBeneficios(c, null);
  return [
    {
      chave: "vale_alimentacao",
      nome: BENEFICIO_CADASTRO_LABEL.vale_alimentacao,
      ativo: snap.beneficios.vale_alimentacao.ativo,
      valorMes: snap.beneficios.vale_alimentacao.valorMes,
      compararValor: true,
    },
    {
      chave: "vale_transporte",
      nome: BENEFICIO_CADASTRO_LABEL.vale_transporte,
      ativo: snap.beneficios.vale_transporte.ativo,
      valorMes: snap.beneficios.vale_transporte.valorMes,
    },
    {
      chave: "premio_assiduidade",
      nome: BENEFICIO_CADASTRO_LABEL.premio_assiduidade,
      ativo: snap.beneficios.premio_assiduidade.ativo,
      valorMes: snap.beneficios.premio_assiduidade.valorMes,
    },
  ];
}

/**
 * Colegas ativos no formato do motor de isonomia, com o sindicato patronal já
 * resolvido pela unidade. Fonte única do cadastro e da lista de colaboradores.
 */
export function useDpIsonomiaColegas() {
  const colaboradores = useDpColaboradores();
  const { atribuicoes } = useDpBeneficios();
  const patronalPorUnidade = useDpPatronalPorUnidade();
  const sindicatos = useDpSindicatos();

  const colegas = useMemo<ColegaIsonomia[]>(() => {
    const patronal = patronalPorUnidade.data ?? {};
    return (colaboradores.data ?? [])
      .filter((c: any) => c.ativo !== false && !c.data_desligamento)
      .map((c: any) =>
        snapshotColegaBeneficios(
          c as LinhaColaboradorBeneficios,
          c.unidade_id ? patronal[c.unidade_id]?.id ?? null : null,
          atribuicoes as any[],
        ),
      );
  }, [colaboradores.data, atribuicoes, patronalPorUnidade.data]);

  const nomePorSindicato = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sindicatos.data ?? []) map[s.id] = s.nome;
    return map;
  }, [sindicatos.data]);

  return {
    colegas,
    nomePorSindicato,
    patronalPorUnidade: patronalPorUnidade.data ?? {},
    isLoading: colaboradores.isLoading || patronalPorUnidade.isLoading,
  };
}

/**
 * Divergências de benefício por colaborador ativo — alimenta o selo da lista de
 * colaboradores, para que a diferença não fique escondida dentro do cadastro.
 */
export function useDpIsonomiaDivergencias() {
  const { colegas, nomePorSindicato, isLoading } = useDpIsonomiaColegas();

  const porColaborador = useMemo(() => {
    const out: Record<string, DivergenciaIsonomia[]> = {};
    for (const alvo of colegas) {
      const outros = colegas.filter((c) => c.colaborador_id !== alvo.colaborador_id);
      const itens: BeneficioAlvoIsonomia[] = [
        { chave: "vale_alimentacao", nome: BENEFICIO_CADASTRO_LABEL.vale_alimentacao, ativo: alvo.beneficios.vale_alimentacao.ativo, valorMes: alvo.beneficios.vale_alimentacao.valorMes, compararValor: true },
        { chave: "vale_transporte", nome: BENEFICIO_CADASTRO_LABEL.vale_transporte, ativo: alvo.beneficios.vale_transporte.ativo },
        { chave: "premio_assiduidade", nome: BENEFICIO_CADASTRO_LABEL.premio_assiduidade, ativo: alvo.beneficios.premio_assiduidade.ativo },
      ];
      const divs = divergenciasIsonomia(itens, outros, alvo, {
        sindicatoNome: alvo.sindicato_id ? nomePorSindicato[alvo.sindicato_id] ?? null : null,
      });
      if (divs.length > 0) out[alvo.colaborador_id] = divs;
    }
    return out;
  }, [colegas, nomePorSindicato]);

  return { porColaborador, isLoading };
}
