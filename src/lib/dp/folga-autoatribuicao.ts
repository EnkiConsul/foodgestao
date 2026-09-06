/**
 * Helpers da distribuição automática de folgas (execução manual pelo gestor).
 */

export type PreviaAutoatribuicao = {
  competencia: string | null;
  elegiveis: number;
  semFolga: number;
  aCriar: number;
  folgasExigidas: number;
};

export type ResultadoAutoatribuicao = {
  geradas: number;
  excedidas: number;
  semDia: number;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Normaliza o retorno da prévia do banco. */
export function parsePreviaAutoatribuicao(raw: unknown): PreviaAutoatribuicao {
  const obj = asRecord(raw);
  return {
    competencia: typeof obj.competencia === "string" ? obj.competencia : null,
    elegiveis: num(obj.elegiveis),
    semFolga: num(obj.sem_folga),
    aCriar: num(obj.a_criar),
    folgasExigidas: num(obj.folgas_exigidas),
  };
}

/** Normaliza o retorno da execução, contando quem ficou sem dia disponível. */
export function parseResultadoAutoatribuicao(raw: unknown): ResultadoAutoatribuicao {
  const obj = asRecord(raw);
  const detalhes = Array.isArray(obj.detalhes) ? obj.detalhes : [];
  const semDia = detalhes.filter((d) => {
    const motivo = asRecord(d).motivo;
    return motivo === "SEM_DIA_DISPONIVEL" || motivo === "SEM_DIA_SEM_CONFLITO";
  }).length;
  return {
    geradas: num(obj.geradas),
    excedidas: num(obj.excedidas),
    semDia,
  };
}

/** Texto de confirmação para o gestor antes de rodar a distribuição. */
export function resumoPrevia(previa: PreviaAutoatribuicao): string {
  if (previa.aCriar <= 0) {
    return "Todas as pessoas já têm folga registrada neste mês. Nada será criado.";
  }
  const pessoas = previa.semFolga === 1 ? "1 pessoa está" : `${previa.semFolga} pessoas estão`;
  const folgas = previa.aCriar === 1 ? "1 folga" : `${previa.aCriar} folgas`;
  return `${pessoas} sem folga neste mês. Serão criadas até ${folgas}.`;
}

/** Texto do resultado da execução. */
export function resumoResultado(resultado: ResultadoAutoatribuicao): string {
  if (resultado.geradas === 0) {
    return "Nenhuma folga nova foi criada.";
  }
  const partes = [
    `${resultado.geradas} folga(s) definida(s) pelo sistema`,
  ];
  if (resultado.excedidas > 0) {
    partes.push(`${resultado.excedidas} em dias acima do limite (revise no calendário)`);
  }
  if (resultado.semDia > 0) {
    partes.push(`${resultado.semDia} pessoa(s) sem dia disponível`);
  }
  return `${partes.join(" — ")}.`;
}
