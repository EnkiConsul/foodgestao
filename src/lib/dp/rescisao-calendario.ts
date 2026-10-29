import { STATUS_PROCESSOS_VISIVEIS } from "./desligamento-apresentacao";

export type ProcessoCalendario = {
  id: string;
  status: string;
  ultimo_comparecimento: string | null;
  data_efetiva: string;
  prazo_10_dias: string;
  colaborador: { nome: string; unidade_id: string | null } | null;
};

/** Apenas datas persistidas; nenhum cálculo de aviso ou inferência de comparecimento. */
export function marcosRescisao(p: ProcessoCalendario) {
  return [
    { tipo: "ultimo_dia", label: "Último dia", data: p.ultimo_comparecimento },
    { tipo: "termino", label: "Fim do contrato", data: p.data_efetiva },
    { tipo: "pagamento", label: "Prazo de pagamento", data: p.prazo_10_dias },
  ].filter((m): m is typeof m & { data: string } => !!m.data && /^\d{4}-\d{2}-\d{2}$/.test(m.data));
}

export function rescisoesPeriodo<T extends ProcessoCalendario>(processos: T[], periodo: string, unidadeId?: string | null): T[] {
  return processos.filter((p) => STATUS_PROCESSOS_VISIVEIS.includes(p.status)
    && (!unidadeId || p.colaborador?.unidade_id === unidadeId)
    && marcosRescisao(p).some((m) => periodo.length === 10 ? m.data === periodo : m.data.startsWith(`${periodo}-`)))
    .sort((a, b) => {
      const primeira = (p: T) => marcosRescisao(p).filter((m) => periodo.length === 10 ? m.data === periodo : m.data.startsWith(`${periodo}-`)).map((m) => m.data).sort()[0] ?? "";
      return primeira(a).localeCompare(primeira(b)) || (a.colaborador?.nome ?? "").localeCompare(b.colaborador?.nome ?? "", "pt-BR");
    });
}