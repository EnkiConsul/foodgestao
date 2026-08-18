// ------------------------------------------------------------------
// Domínio: DP → Folha de pagamento (Fase 13)
//
// Labels de status, leitura do detalhamento (JSON `descontos` gerado
// pela apuração), totais do período e CSV. Funções puras.
// ------------------------------------------------------------------

import { calcularEncargos, type Encargos } from "./encargos";

export type FolhaPeriodoStatus = "aberto" | "fechado" | "aprovado_dp" | "aprovado_financeiro" | "pago";
export type FolhaLancamentoStatus = "rascunho" | "aprovado_dp" | "aprovado_financeiro" | "pago" | "cancelado";

export const PERIODO_STATUS_LABEL: Record<FolhaPeriodoStatus, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
  aprovado_dp: "Aprovado pelo DP",
  aprovado_financeiro: "Aprovado pelo Financeiro",
  pago: "Pago",
};

export const LANCAMENTO_STATUS_LABEL: Record<FolhaLancamentoStatus, string> = {
  rascunho: "Rascunho",
  aprovado_dp: "Aprovado pelo DP",
  aprovado_financeiro: "Aprovado pelo Financeiro",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const FOLHA_TIPO_LABEL: Record<string, string> = {
  adiantamento: "Adiantamento",
  contracheque_mensal: "Contracheque mensal",
  contracheque_quinzenal: "Contracheque quinzenal",
  decimo_terceiro: "13º salário",
  ferias: "Férias",
  rescisao: "Rescisão (TRCT)",
  vale_alimentacao: "Vale-alimentação",
  vale_transporte: "Vale-transporte",
};

/** Fase 16 — rubrica avulsa lançada manualmente pelo DP no contracheque. */
export interface RubricaExtra {
  descricao: string;
  natureza: "provento" | "desconto";
  valor: number;
  /**
   * Fase 18 — quando `false`, o provento não entra na base de INSS/IRRF
   * (abono pecuniário, adiantamentos, verbas indenizatórias). Default: true.
   */
  tributavel?: boolean;
}

export interface DetalheFolha {
  faltas: number;
  dsr: number;
  proventos: { normais: number; extras50: number; extras100: number; noturno: number };
  horas: {
    normais: number;
    extras50: number;
    extras100: number;
    noturnos: number;
    falta: number;
    atraso: number;
    diasFalta: number;
    dsrPerdidos: number;
  };
  /** Fase 16 — rubricas avulsas (adiantamentos, prêmios, descontos etc.). */
  extras: RubricaExtra[];
  /** Fase 17 — dependentes para dedução do IRRF. */
  dependentes: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lê com segurança o JSON `descontos` de um lançamento (pode vir vazio ou legado). */
export function lerDetalhe(raw: unknown): DetalheFolha {
  const d = (raw ?? {}) as Record<string, any>;
  const p = (d.proventos ?? {}) as Record<string, unknown>;
  const h = (d.horas ?? {}) as Record<string, unknown>;
  return {
    faltas: num(d.faltas),
    dsr: num(d.dsr),
    proventos: {
      normais: num(p.normais),
      extras50: num(p.extras50),
      extras100: num(p.extras100),
      noturno: num(p.noturno),
    },
    horas: {
      normais: num(h.normais),
      extras50: num(h.extras50),
      extras100: num(h.extras100),
      noturnos: num(h.noturnos),
      falta: num(h.falta),
      atraso: num(h.atraso),
      diasFalta: num(h.diasFalta),
      dsrPerdidos: num(h.dsrPerdidos),
    },
    extras: lerExtras(d.extras),
    dependentes: Math.max(0, Math.trunc(num(d.dependentes))),
  };
}

/** Normaliza a lista de rubricas avulsas vinda do JSON. */
export function lerExtras(raw: unknown): RubricaExtra[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>;
      const descricao = typeof r.descricao === "string" ? r.descricao.trim() : "";
      const natureza = r.natureza === "desconto" ? "desconto" : "provento";
      const valor = Math.max(0, num(r.valor));
      const tributavel = r.tributavel === false ? false : true;
      return { descricao, natureza, valor, tributavel } as RubricaExtra;
    })
    .filter((e) => e.descricao.length > 0 && e.valor > 0);
}

/** Soma apenas dos proventos avulsos que compõem a base de INSS/IRRF. */
export function proventosTributaveis(extras: RubricaExtra[]): number {
  return extras
    .filter((e) => e.natureza === "provento" && e.tributavel !== false)
    .reduce((acc, e) => acc + e.valor, 0);
}

/** Soma das rubricas avulsas por natureza. */
export function totaisDosExtras(extras: RubricaExtra[]): { proventos: number; descontos: number } {
  return extras.reduce(
    (acc, e) =>
      e.natureza === "provento"
        ? { ...acc, proventos: acc.proventos + e.valor }
        : { ...acc, descontos: acc.descontos + e.valor },
    { proventos: 0, descontos: 0 },
  );
}

/** Fase 17 — base tributável: proventos apurados + proventos avulsos − faltas/DSR. */
export function baseTributavel(detalhe: DetalheFolha): number {
  const p = detalhe.proventos;
  const base =
    p.normais + p.extras50 + p.extras100 + p.noturno + proventosTributaveis(detalhe.extras) - detalhe.faltas - detalhe.dsr;
  return round2(Math.max(0, base));
}

/** Fase 17 — INSS, IRRF e FGTS do lançamento. */
export function encargosDoLancamento(detalhe: DetalheFolha): Encargos {
  return calcularEncargos(baseTributavel(detalhe), detalhe.dependentes);
}

/**
 * Recalcula bruto/líquido do lançamento a partir do detalhe
 * (proventos apurados + rubricas avulsas − faltas/DSR − INSS/IRRF − descontos avulsos).
 */
export function valoresDoLancamento(detalhe: DetalheFolha): { bruto: number; liquido: number } {
  const p = detalhe.proventos;
  const extras = totaisDosExtras(detalhe.extras);
  const bruto = p.normais + p.extras50 + p.extras100 + p.noturno + extras.proventos;
  const encargos = encargosDoLancamento(detalhe);
  const liquido = bruto - detalhe.faltas - detalhe.dsr - encargos.descontos - extras.descontos;
  return { bruto: round2(bruto), liquido: round2(Math.max(0, liquido)) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface LinhaFolha {
  id: string;
  colaborador_id: string;
  nome: string;
  status: FolhaLancamentoStatus;
  valor_bruto: number;
  valor_liquido: number;
  detalhe: DetalheFolha;
  /** Fase 14 — despesa gerada no financeiro (quando houver). */
  transaction_id?: string | null;
  /** Atestado do mês abonado pela empresa — mantém o prêmio de assiduidade. */
  atestado_abonado?: boolean;
  /** Motivo registrado no abono do atestado. */
  atestado_abono_motivo?: string | null;
}

/** Fase 14 — a despesa da folha só pode ser gerada após aprovação do financeiro. */
export function podeGerarDespesa(status: FolhaPeriodoStatus): boolean {
  return status === "aprovado_financeiro" || status === "pago";
}

export interface TotaisFolha {
  bruto: number;
  liquido: number;
  descontos: number;
  rascunho: number;
  aprovados: number;
  cancelados: number;
}

export function totaisDaFolha(linhas: LinhaFolha[]): TotaisFolha {
  return linhas.reduce<TotaisFolha>(
    (acc, l) => {
      if (l.status === "cancelado") return { ...acc, cancelados: acc.cancelados + 1 };
      return {
        bruto: acc.bruto + l.valor_bruto,
        liquido: acc.liquido + l.valor_liquido,
        descontos: acc.descontos + (l.valor_bruto - l.valor_liquido),
        rascunho: acc.rascunho + (l.status === "rascunho" ? 1 : 0),
        aprovados: acc.aprovados + (l.status === "rascunho" ? 0 : 1),
        cancelados: acc.cancelados,
      };
    },
    { bruto: 0, liquido: 0, descontos: 0, rascunho: 0, aprovados: 0, cancelados: 0 },
  );
}

/** Próximo status permitido no ciclo da folha (null = fim do ciclo). */
export function proximoStatusPeriodo(status: FolhaPeriodoStatus): FolhaPeriodoStatus | null {
  const ordem: FolhaPeriodoStatus[] = ["aberto", "fechado", "aprovado_dp", "aprovado_financeiro", "pago"];
  const i = ordem.indexOf(status);
  return i < 0 || i === ordem.length - 1 ? null : ordem[i + 1];
}

export const formatarBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** CSV do período (Excel pt-BR: separador ";"). */
export function folhaParaCsv(competencia: string, linhas: LinhaFolha[]): string {
  const cab = [
    "Colaborador",
    "Competencia",
    "Proventos normais",
    "Extras 50%",
    "Extras 100%",
    "Adicional noturno",
    "Desconto faltas",
    "Desconto DSR",
    "Outros proventos",
    "Outros descontos",
    "INSS",
    "IRRF",
    "FGTS",
    "Bruto",
    "Liquido",
    "Status",
  ];
  const n = (v: number) => v.toFixed(2).replace(".", ",");
  const corpo = linhas.map((l) => {
    const enc = encargosDoLancamento(l.detalhe);
    return [
      l.nome,
      competencia,
      n(l.detalhe.proventos.normais),
      n(l.detalhe.proventos.extras50),
      n(l.detalhe.proventos.extras100),
      n(l.detalhe.proventos.noturno),
      n(l.detalhe.faltas),
      n(l.detalhe.dsr),
      n(totaisDosExtras(l.detalhe.extras).proventos),
      n(totaisDosExtras(l.detalhe.extras).descontos),
      n(enc.inss),
      n(enc.irrf),
      n(enc.fgts),
      n(l.valor_bruto),
      n(l.valor_liquido),
      LANCAMENTO_STATUS_LABEL[l.status],
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";");
  });
  return [cab.join(";"), ...corpo].join("\n");
}
