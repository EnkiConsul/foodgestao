import { useMemo } from "react";
import {
  admitidosNo,
  desligadosNo,
  distribuir,
  headcountEm,
  headcountMedio,
  permanencia,
  serieMensal,
  turnoverPeriodo,
  type ColaboradorAnalytics,
} from "@/lib/dp/analytics/equipe";
import { isoDe, periodoAnterior, variacao, type PeriodoAnalytics } from "@/lib/dp/analytics/periodo";
import { MOTIVO_DESLIGAMENTO_LABEL } from "@/lib/dp/desligamento";

type Colab = ColaboradorAnalytics & { motivo_desligamento?: string | null };

interface Opts {
  colaboradores: readonly Colab[];
  periodo: PeriodoAnalytics;
  nomes: {
    unidade: (id: string | null) => string;
    cargo: (id: string | null) => string;
    setor: (id: string | null) => string;
  };
}

/** Quadro, entradas, saídas, permanência e distribuição — só do cadastro. */
export function useAnalyticsEquipe({ colaboradores, periodo, nomes }: Opts) {
  return useMemo(() => {
    const anterior = periodoAnterior(periodo);
    const hoje = isoDe(new Date());
    const admissoes = admitidosNo(colaboradores, periodo);
    const desligamentos = desligadosNo(colaboradores, periodo);
    const noQuadro = colaboradores.filter(
      (c) => (!c.data_admissao || c.data_admissao <= hoje) && !c.data_desligamento,
    );

    const turnover = turnoverPeriodo(colaboradores, periodo);

    return {
      kpis: {
        headcountAtual: headcountEm(colaboradores, hoje),
        headcountMedio: headcountMedio(colaboradores, periodo),
        admissoes: admissoes.length,
        desligamentos: desligamentos.length,
        turnover,
        turnoverVariacao: variacao(turnover, turnoverPeriodo(colaboradores, anterior)),
      },
      serie: serieMensal(colaboradores, periodo),
      permanencia: permanencia(colaboradores, periodo),
      motivos: distribuir(
        desligamentos as Colab[],
        (c) => c.motivo_desligamento ?? null,
        (k) =>
          k
            ? MOTIVO_DESLIGAMENTO_LABEL[k as keyof typeof MOTIVO_DESLIGAMENTO_LABEL] ?? k
            : "Não informado",
      ),
      porUnidade: distribuir(noQuadro, (c) => c.unidade_id, nomes.unidade),
      porCargo: distribuir(noQuadro, (c) => c.cargo_id, nomes.cargo),
      porSetor: distribuir(noQuadro, (c) => c.setor_id, nomes.setor),
      porVinculo: distribuir(noQuadro, (c) => c.regime, (k) => k ?? "Não informado"),
      admissoesLista: admissoes,
      desligamentosLista: desligamentos,
    };
  }, [colaboradores, periodo, nomes]);
}
