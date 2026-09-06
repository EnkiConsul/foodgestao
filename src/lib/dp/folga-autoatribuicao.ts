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

export type PlanoItem = {
  colaboradorId: string;
  nome: string;
  data: string | null;
  excedeLimite: boolean;
  motivo: string | null;
};

export type PlanoAutoatribuicao = {
  competencia: string | null;
  dias: number[];
  folgasExigidas: number;
  elegiveis: number;
  itens: PlanoItem[];
};

export type ResultadoAutoatribuicao = {
  geradas: number;
  excedidas: number;
  semDia: number;
  ignoradas: number;
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

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

/** Normaliza o plano (dry-run) devolvido pelo banco. */
export function parsePlanoAutoatribuicao(raw: unknown): PlanoAutoatribuicao {
  const obj = asRecord(raw);
  const itensRaw = Array.isArray(obj.itens) ? obj.itens : [];
  const itens: PlanoItem[] = [];
  for (const it of itensRaw) {
    const o = asRecord(it);
    const id = str(o.colaborador_id);
    if (!id) continue;
    itens.push({
      colaboradorId: id,
      nome: str(o.colaborador_nome) ?? "Sem nome",
      data: str(o.data_sugerida),
      excedeLimite: o.excede_limite === true,
      motivo: str(o.motivo),
    });
  }
  const dias = Array.isArray(obj.dias)
    ? obj.dias.map((d) => num(d)).filter((d) => d >= 0 && d <= 6)
    : [];
  return {
    competencia: str(obj.competencia),
    dias,
    folgasExigidas: num(obj.folgas_exigidas),
    elegiveis: num(obj.elegiveis),
    itens,
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
  const ignoradas = Array.isArray(obj.ignoradas) ? obj.ignoradas.length : 0;
  return {
    geradas: num(obj.geradas),
    excedidas: num(obj.excedidas),
    semDia,
    ignoradas,
  };
}

/** Dias do mês (ISO) que caem nos dias de descanso aplicáveis. */
export function diasValidosDoMes(competencia: string | null, dias: number[]): string[] {
  if (!competencia) return [];
  const base = new Date(`${competencia.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  const ano = base.getFullYear();
  const mes = base.getMonth();
  const total = new Date(ano, mes + 1, 0).getDate();
  const out: string[] = [];
  for (let dia = 1; dia <= total; dia += 1) {
    const d = new Date(ano, mes, dia, 12, 0, 0);
    if (!dias.includes(d.getDay())) continue;
    const mm = String(mes + 1).padStart(2, "0");
    const dd = String(dia).padStart(2, "0");
    out.push(`${ano}-${mm}-${dd}`);
  }
  return out;
}

/** Itens do plano que podem ser criados (têm data definida). */
export function itensAplicaveis(itens: PlanoItem[]): PlanoItem[] {
  return itens.filter((i) => !!i.data);
}

/** Texto de confirmação para o gestor antes de rodar a distribuição. */
export function resumoPlano(plano: PlanoAutoatribuicao): string {
  const aplicaveis = itensAplicaveis(plano.itens).length;
  if (plano.itens.length === 0) {
    return "Todas as folgas deste mês já atendem à regra da unidade. Nada a criar.";
  }

  if (aplicaveis === 0) {
    return "Nenhuma das pessoas sem folga tem dia disponível neste mês.";
  }
  const pessoas = aplicaveis === 1 ? "1 pessoa está" : `${aplicaveis} pessoas estão`;
  return `${pessoas} sem folga neste mês. Revise as datas antes de confirmar.`;
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
  if (resultado.ignoradas > 0) {
    partes.push(`${resultado.ignoradas} não criada(s)`);
  }
  return `${partes.join(" — ")}.`;
}
