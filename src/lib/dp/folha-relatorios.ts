// ------------------------------------------------------------------
// Domínio: DP → Relatórios da folha (Fase 21)
//
// Consolida os lançamentos de um ano em resumos mensais e anuais
// (por colaborador), com os encargos legais. Funções puras.
// ------------------------------------------------------------------

import { encargosDoLancamento, totaisDosExtras, type DetalheFolha } from "./folha";

export interface LancamentoRelatorio {
  colaboradorId: string;
  nome: string;
  unidadeId: string | null;
  /** Competência no formato YYYY-MM. */
  competencia: string;
  tipo: string;
  status: string;
  bruto: number;
  liquido: number;
  detalhe: DetalheFolha;
}

export interface ResumoFolha {
  bruto: number;
  descontos: number;
  inss: number;
  irrf: number;
  fgts: number;
  outrosDescontos: number;
  liquido: number;
  colaboradores: number;
  lancamentos: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

const vazio = (): ResumoFolha => ({
  bruto: 0,
  descontos: 0,
  inss: 0,
  irrf: 0,
  fgts: 0,
  outrosDescontos: 0,
  liquido: 0,
  colaboradores: 0,
  lancamentos: 0,
});

/** Lançamentos cancelados nunca entram nos relatórios. */
export function lancamentosValidos(linhas: LancamentoRelatorio[]): LancamentoRelatorio[] {
  return linhas.filter((l) => l.status !== "cancelado");
}

/** Consolida uma lista de lançamentos em um único resumo. */
export function resumirFolha(linhas: LancamentoRelatorio[]): ResumoFolha {
  const validos = lancamentosValidos(linhas);
  const resumo = validos.reduce<ResumoFolha>((acc, l) => {
    const enc = encargosDoLancamento(l.detalhe);
    const extras = totaisDosExtras(l.detalhe.extras);
    return {
      bruto: acc.bruto + l.bruto,
      descontos: acc.descontos + (l.bruto - l.liquido),
      inss: acc.inss + enc.inss,
      irrf: acc.irrf + enc.irrf,
      fgts: acc.fgts + enc.fgts,
      outrosDescontos: acc.outrosDescontos + extras.descontos + l.detalhe.faltas + l.detalhe.dsr,
      liquido: acc.liquido + l.liquido,
      colaboradores: 0,
      lancamentos: acc.lancamentos + 1,
    };
  }, vazio());

  return {
    ...resumo,
    bruto: round2(resumo.bruto),
    descontos: round2(resumo.descontos),
    inss: round2(resumo.inss),
    irrf: round2(resumo.irrf),
    fgts: round2(resumo.fgts),
    outrosDescontos: round2(resumo.outrosDescontos),
    liquido: round2(resumo.liquido),
    colaboradores: new Set(validos.map((l) => l.colaboradorId)).size,
  };
}

export interface LinhaMensal extends ResumoFolha {
  /** Competência YYYY-MM. */
  competencia: string;
  mes: number;
}

/** Resumo mês a mês do ano (12 linhas, inclusive meses sem movimento). */
export function resumoMensal(ano: number, linhas: LancamentoRelatorio[]): LinhaMensal[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
    const doMes = linhas.filter((l) => l.competencia === competencia);
    return { competencia, mes, ...resumirFolha(doMes) };
  });
}

export interface LinhaAnualColaborador extends ResumoFolha {
  colaboradorId: string;
  nome: string;
}

/** Resumo anual por colaborador (base do informe de rendimentos). */
export function resumoPorColaborador(linhas: LancamentoRelatorio[]): LinhaAnualColaborador[] {
  const grupos = new Map<string, LancamentoRelatorio[]>();
  for (const l of lancamentosValidos(linhas)) {
    const atual = grupos.get(l.colaboradorId);
    if (atual) atual.push(l);
    else grupos.set(l.colaboradorId, [l]);
  }
  return Array.from(grupos.entries())
    .map(([colaboradorId, itens]) => ({
      colaboradorId,
      nome: itens[0]?.nome ?? "Colaborador",
      ...resumirFolha(itens),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Total pago por tipo de folha (contracheque, férias, 13º, rescisão...). */
export function resumoPorTipo(linhas: LancamentoRelatorio[]): { tipo: string; bruto: number; lancamentos: number }[] {
  const mapa = new Map<string, { bruto: number; lancamentos: number }>();
  for (const l of lancamentosValidos(linhas)) {
    const atual = mapa.get(l.tipo) ?? { bruto: 0, lancamentos: 0 };
    mapa.set(l.tipo, { bruto: round2(atual.bruto + l.bruto), lancamentos: atual.lancamentos + 1 });
  }
  return Array.from(mapa.entries())
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.bruto - a.bruto);
}

const csv = (linhas: (string | number)[][]) =>
  linhas
    .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
    .join("\n");

const n = (v: number) => v.toFixed(2).replace(".", ",");

const COLUNAS = ["Bruto", "INSS", "IRRF", "FGTS", "Outros descontos", "Total descontos", "Liquido"];

/** CSV do resumo mensal do ano (Excel pt-BR). */
export function resumoMensalParaCsv(ano: number, mensal: LinhaMensal[]): string {
  const corpo = mensal.map((m) => [
    m.competencia,
    m.colaboradores,
    n(m.bruto),
    n(m.inss),
    n(m.irrf),
    n(m.fgts),
    n(m.outrosDescontos),
    n(m.descontos),
    n(m.liquido),
  ]);
  return csv([[`Resumo da folha ${ano}`], ["Competencia", "Colaboradores", ...COLUNAS], ...corpo]);
}

/** CSV do resumo anual por colaborador (informe de rendimentos simplificado). */
export function resumoAnualParaCsv(ano: number, linhas: LinhaAnualColaborador[]): string {
  const corpo = linhas.map((c) => [
    c.nome,
    ano,
    n(c.bruto),
    n(c.inss),
    n(c.irrf),
    n(c.fgts),
    n(c.outrosDescontos),
    n(c.descontos),
    n(c.liquido),
  ]);
  return csv([[`Rendimentos por colaborador ${ano}`], ["Colaborador", "Ano", ...COLUNAS], ...corpo]);
}
