// Mudança do dia da própria folga (sábado <-> domingo do mesmo mês).
// Funções puras — o servidor revalida tudo em `dp_folga_remarcar`.

import { parseYMD, ymd } from "@/lib/dp/folga-rules";

export interface DiaRemarcacao {
  iso: string;
  /** 0 = domingo … 6 = sábado */
  dow: number;
  /** Pode ser remarcado direto pelo colaborador? */
  disponivel: boolean;
  /** Quando indisponível, o motivo em linguagem simples. */
  motivo: string | null;
}

export interface DiasParaRemarcarInput {
  /** Dia em que a folga está hoje. */
  dataAtualIso: string;
  hojeIso: string;
  /** Dias da semana de descanso aceitos na unidade (0 = domingo). */
  diasElegiveis: number[];
  /** Datas bloqueadas administrativamente e não liberadas. */
  bloqueadas?: string[];
  /** Datas que já atingiram o limite de pessoas em folga. */
  lotadas?: string[];
  /** Datas em que o colaborador já tem folga ativa. */
  minhasFolgas?: string[];
}

/** Dias do mês da folga atual para onde ela pode ser movida. */
export function diasParaRemarcar(input: DiasParaRemarcarInput): DiaRemarcacao[] {
  const atual = parseYMD(input.dataAtualIso);
  const hoje = parseYMD(input.hojeIso);
  const elegiveis = input.diasElegiveis.length > 0 ? input.diasElegiveis : [0, 6];
  const bloqueadas = new Set(input.bloqueadas ?? []);
  const lotadas = new Set(input.lotadas ?? []);
  const minhas = new Set(input.minhasFolgas ?? []);

  const ultimo = new Date(atual.getFullYear(), atual.getMonth() + 1, 0).getDate();
  const dias: DiaRemarcacao[] = [];

  for (let d = 1; d <= ultimo; d += 1) {
    const date = new Date(atual.getFullYear(), atual.getMonth(), d);
    const iso = ymd(date);
    if (iso === input.dataAtualIso) continue;
    const dow = date.getDay();
    if (!elegiveis.includes(dow)) continue;
    if (date < hoje) continue;

    let motivo: string | null = null;
    if (minhas.has(iso)) motivo = "Você já tem folga neste dia";
    else if (bloqueadas.has(iso)) motivo = "Data bloqueada pelo DP";
    else if (lotadas.has(iso)) motivo = "Limite de pessoas em folga atingido";

    dias.push({ iso, dow, disponivel: motivo === null, motivo });
  }
  return dias;
}

/** Mensagem amigável para os erros da remarcação vindos do banco. */
export function mensagemErroRemarcacao(raw: string): string {
  const m = raw ?? "";
  if (m.includes("FOLGA_REMARCAR_LIMITE_DIA"))
    return "O dia escolhido já atingiu o limite de pessoas em folga. Você pode pedir a mudança ao DP.";
  if (m.includes("FOLGA_REMARCAR_BLOQUEADA"))
    return "O dia escolhido está bloqueado pelo DP. Você pode pedir a mudança ao DP.";
  if (m.includes("FOLGA_REMARCAR_CONFLITO"))
    return (
      m.split("FOLGA_REMARCAR_CONFLITO:").pop()?.trim() ||
      "Um colega que não pode folgar com você já está de folga neste dia."
    );
  if (m.includes("FOLGA_REMARCAR_DIA_INVALIDO"))
    return "Este dia não é um dia de descanso previsto na sua unidade.";
  if (m.includes("FOLGA_REMARCAR_OUTRO_MES"))
    return "Escolha um dia do mesmo mês da folga atual.";
  if (m.includes("FOLGA_REMARCAR_TIPO_INVALIDO"))
    return "Esta folga não pode ser remarcada por aqui. Fale com o DP.";
  if (m.includes("FOLGA_NAO_ENCONTRADA")) return "Folga não encontrada neste dia.";
  if (m.includes("DUPLICATE_REQUEST"))
    return "Você já tem folga ou um pedido pendente para o dia escolhido.";
  if (m.includes("PAST_DATE_NOT_EDITABLE")) return "Não é possível mudar folga em datas passadas.";
  return "Não foi possível mudar o dia da folga. Tente novamente.";
}

/** O erro indica que o DP precisa decidir (dia lotado, bloqueado ou com conflito)? */
export function pedirAoDp(raw: string): boolean {
  const m = raw ?? "";
  return (
    m.includes("FOLGA_REMARCAR_LIMITE_DIA") ||
    m.includes("FOLGA_REMARCAR_BLOQUEADA") ||
    m.includes("FOLGA_REMARCAR_CONFLITO")
  );
}
