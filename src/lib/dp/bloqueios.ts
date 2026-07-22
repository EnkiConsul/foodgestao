// ------------------------------------------------------------------
// Domínio: DP → Datas Bloqueadas
// Tipos, constantes e helpers puros (sem dependência de React/Supabase)
// ------------------------------------------------------------------

export type Unidade = { id: string; nome: string };

export type RegraJson = {
  aplicacao?: "anual" | "unica";
  ano_referencia?: number | null;
  meses?: number[];
  dias?: number[];
  ordinal?: number | null;
  dia_semana?: number | null;
  pos_pagamento_dia?: number | null;
};

export type Regra = {
  id: string;
  company_id: string;
  nome: string;
  tipo: "fixa_anual" | "dinamica" | "pos_pagamento";
  mes: number | null;
  dia: number | null;
  regra_json: RegraJson | null;
  ativo: boolean;
  unidades?: Unidade[];
};

export type DataBloq = {
  id: string;
  company_id: string;
  data: string;
  motivo: string;
  regra_id: string | null;
  unidade_id: string | null;
  liberada_por_solicitacao: string | null;
  liberada?: boolean | null;
  unidade?: Unidade | null;
  /**
   * Overrides parciais por unidade (apenas usado nas visões consolidadas
   * quando a regra de origem é global).
   */
  partialOverrides?: Array<{ id: string; unidade_id: string; unidade_nome: string }>;
};

export type RegraFormState = {
  nome: string;
  tipo: "fixa_anual" | "dinamica" | "pos_pagamento";
  aplicacao: "anual" | "unica";
  ano_referencia: number | null;
  meses: number[];
  dias: number[];
  ordinal: number | null;
  dia_semana: number | null;
  pos_pagamento_dia: number | null;
  ativo: boolean;
  unidades: string[];
};

export type DataFormState = {
  data: string;
  motivo: string;
  unidade_id: string;
};

export const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);
export const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const NOMES_ORDINAIS = ["Primeiro", "Segundo", "Terceiro", "Quarto", "Quinto"];
export const NOMES_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const getMonthName = (m: number) => NOMES_MESES[m - 1] ?? String(m);

export const formatBR = (iso: string) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
};

export const parseYMD = (iso: string) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d);
};

export const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const getTipoLabel = (t: string) =>
  t === "fixa_anual" ? "Fixa (dia/mês fixo)"
  : t === "dinamica" ? "Dinâmica (ex: 2º sábado)"
  : t === "pos_pagamento" ? "Pós-Pagamento (1º sáb e dom após dia 5)"
  : t;

export const toggleArr = <T,>(arr: T[], v: T): T[] =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

// ------------------------------------------------------------------
// Gera as datas concretas de uma regra nos próximos 13 meses a partir de "hoje".
// ------------------------------------------------------------------
export function gerarDatasParaRegra(r: Regra, hoje: Date): string[] {
  const cfg = r.regra_json ?? {};
  const mesesConfig = cfg.meses && cfg.meses.length > 0 ? cfg.meses : r.mes ? [r.mes] : MESES;
  const diasConfig = cfg.dias && cfg.dias.length > 0 ? cfg.dias : r.dia ? [r.dia] : [];

  const start = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const out = new Set<string>();

  for (let i = 0; i < 13; i++) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const ano = cursor.getFullYear();
    const mes = cursor.getMonth() + 1;

    if (cfg.aplicacao === "unica" && cfg.ano_referencia && cfg.ano_referencia !== ano) continue;
    if (!mesesConfig.includes(mes)) continue;

    if (r.tipo === "fixa_anual") {
      const diasAlvo = diasConfig.length ? diasConfig : Array.from({ length: 31 }, (_, k) => k + 1);
      for (const dia of diasAlvo) {
        const d = new Date(ano, mes - 1, dia);
        if (d.getMonth() !== mes - 1) continue;
        if (d < hoje) continue;
        out.add(toYMD(d));
      }
    } else if (r.tipo === "dinamica") {
      const ordinal = cfg.ordinal ?? 1;
      const diaSemana = cfg.dia_semana ?? 0;
      const first = new Date(ano, mes - 1, 1);
      const shift = (diaSemana - first.getDay() + 7) % 7;
      const diaAlvo = 1 + shift + (ordinal - 1) * 7;
      const d = new Date(ano, mes - 1, diaAlvo);
      if (d.getMonth() === mes - 1 && d >= hoje) out.add(toYMD(d));
    } else if (r.tipo === "pos_pagamento") {
      const diaBase = cfg.pos_pagamento_dia ?? 5;
      const cursor2 = new Date(ano, mes - 1, diaBase + 1);
      while (cursor2.getDay() !== 6) cursor2.setDate(cursor2.getDate() + 1);
      if (cursor2.getMonth() === mes - 1 && cursor2 >= hoje) out.add(toYMD(cursor2));
      const dom = new Date(cursor2);
      dom.setDate(dom.getDate() + 1);
      if (dom.getMonth() === mes - 1 && dom >= hoje) out.add(toYMD(dom));
    }
  }

  return Array.from(out);
}

export const emptyRegraForm: RegraFormState = {
  nome: "",
  tipo: "fixa_anual",
  aplicacao: "anual",
  ano_referencia: null,
  meses: [],
  dias: [],
  ordinal: null,
  dia_semana: null,
  pos_pagamento_dia: 5,
  ativo: true,
  unidades: [],
};

export const regraToFormState = (r: Regra): RegraFormState => {
  const cfg = r.regra_json ?? {};
  return {
    nome: r.nome,
    tipo: r.tipo,
    aplicacao: (cfg.aplicacao as "anual" | "unica") ?? "anual",
    ano_referencia: cfg.ano_referencia ?? null,
    meses: cfg.meses && cfg.meses.length ? cfg.meses : (r.mes ? [r.mes] : []),
    dias: cfg.dias && cfg.dias.length ? cfg.dias : (r.dia ? [r.dia] : []),
    ordinal: cfg.ordinal ?? null,
    dia_semana: cfg.dia_semana ?? null,
    pos_pagamento_dia: cfg.pos_pagamento_dia ?? 5,
    ativo: r.ativo,
    unidades: (r.unidades ?? []).map((u) => u.id),
  };
};
