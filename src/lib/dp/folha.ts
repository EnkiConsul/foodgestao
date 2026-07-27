// ------------------------------------------------------------------
// Domínio: DP → Folha de pagamento (Fase 13)
//
// Labels de status, leitura do detalhamento (JSON `descontos` gerado
// pela apuração), totais do período e CSV. Funções puras.
// ------------------------------------------------------------------

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
  vale_alimentacao: "Vale-alimentação",
  vale_transporte: "Vale-transporte",
};

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
  };
}

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
    "Bruto",
    "Liquido",
    "Status",
  ];
  const n = (v: number) => v.toFixed(2).replace(".", ",");
  const corpo = linhas.map((l) =>
    [
      l.nome,
      competencia,
      n(l.detalhe.proventos.normais),
      n(l.detalhe.proventos.extras50),
      n(l.detalhe.proventos.extras100),
      n(l.detalhe.proventos.noturno),
      n(l.detalhe.faltas),
      n(l.detalhe.dsr),
      n(l.valor_bruto),
      n(l.valor_liquido),
      LANCAMENTO_STATUS_LABEL[l.status],
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";"),
  );
  return [cab.join(";"), ...corpo].join("\n");
}
