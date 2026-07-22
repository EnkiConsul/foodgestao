// ------------------------------------------------------------------
// Domínio: DP → Regras de Datas Bloqueadas (avaliação em runtime)
// Expande registros de `dp_bloqueio_regras` para o conjunto de datas
// (YYYY-MM-DD) que cobrem um intervalo. Espelha, em TypeScript, a
// função SQL `public.dp_regra_bloqueia_data` — as duas devem manter
// semântica idêntica.
// ------------------------------------------------------------------

export type RegraRow = {
  id: string;
  company_id: string;
  nome: string;
  tipo: string; // 'fixa_anual' | 'dinamica' (enum no banco)
  mes: number | null;
  dia: number | null;
  regra_json: {
    aplicacao?: "anual" | "unica" | null;
    ano_referencia?: number | null;
    meses?: number[] | null;
    dias?: number[] | null;
    ordinal?: number | null;
    dia_semana?: number | null;
    pos_pagamento_dia?: number | null;
    tipo_original?: string | null;
  } | null;
  ativo: boolean;
};

export type RegraUnidadeLink = { regra_id: string; unidade_id: string };

const pad2 = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Expande uma regra para o conjunto de datas ISO (YYYY-MM-DD) contidas
 * no intervalo [from, to] (inclusive). Ignora regras inativas ou fora
 * do `ano_referencia` quando `aplicacao === 'unica'`.
 */
export function expandRegraNoIntervalo(
  regra: RegraRow,
  from: Date,
  to: Date,
): Set<string> {
  const out = new Set<string>();
  if (!regra.ativo) return out;

  const cfg = regra.regra_json ?? {};
  const aplicacao = cfg.aplicacao ?? "anual";
  const anoRef = cfg.ano_referencia ?? null;

  const mesesConfig =
    cfg.meses && cfg.meses.length > 0
      ? cfg.meses
      : regra.mes
        ? [regra.mes]
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const diasConfig =
    cfg.dias && cfg.dias.length > 0 ? cfg.dias : regra.dia ? [regra.dia] : [];

  // tipo efetivo (o banco usa "dinamica" para várias subvariantes)
  const subtipo =
    regra.tipo === "dinamica" && cfg.tipo_original === "pos_pagamento"
      ? "pos_pagamento"
      : regra.tipo === "dinamica"
        ? "dinamica_ordinal"
        : regra.tipo; // fixa_anual etc.

  const yStart = from.getFullYear();
  const yEnd = to.getFullYear();

  const addIfInRange = (d: Date) => {
    if (d < from || d > to) return;
    out.add(toIso(d));
  };

  for (let ano = yStart; ano <= yEnd; ano++) {
    if (aplicacao === "unica" && anoRef != null && anoRef !== ano) continue;

    for (const mes of mesesConfig) {
      if (subtipo === "fixa_anual") {
        const diasAlvo =
          diasConfig.length > 0
            ? diasConfig
            : Array.from({ length: 31 }, (_, k) => k + 1);
        for (const dia of diasAlvo) {
          const d = new Date(ano, mes - 1, dia);
          if (d.getMonth() !== mes - 1) continue; // dia inválido no mês
          addIfInRange(d);
        }
      } else if (subtipo === "dinamica_ordinal") {
        const ordinal = cfg.ordinal ?? 1;
        const diaSemana = cfg.dia_semana ?? 0;
        const primeiroDoMes = new Date(ano, mes - 1, 1);
        const shift = (diaSemana - primeiroDoMes.getDay() + 7) % 7;
        const diaAlvo = 1 + shift + (ordinal - 1) * 7;
        const d = new Date(ano, mes - 1, diaAlvo);
        if (d.getMonth() === mes - 1) addIfInRange(d);
      } else if (subtipo === "pos_pagamento") {
        // 1º sábado após o dia base, e o domingo seguinte
        const diaBase = cfg.pos_pagamento_dia ?? 5;
        const cursor = new Date(ano, mes - 1, diaBase + 1);
        while (cursor.getMonth() === mes - 1 && cursor.getDay() !== 6) {
          cursor.setDate(cursor.getDate() + 1);
        }
        if (cursor.getMonth() === mes - 1) {
          addIfInRange(new Date(cursor));
          const dom = new Date(cursor);
          dom.setDate(dom.getDate() + 1);
          if (dom.getMonth() === mes - 1) addIfInRange(dom);
        }
      }
    }
  }

  return out;
}

/**
 * Retorna um Map<data ISO, motivo> com todas as datas bloqueadas por
 * regras ativas no intervalo, considerando o vínculo de unidade:
 *  - regra sem unidades vinculadas: aplica a todos.
 *  - regra com unidades vinculadas: aplica apenas se `unidadeId` estiver
 *    na lista.
 */
export function buildBloqueiosDeRegras(params: {
  regras: RegraRow[];
  vinculos: RegraUnidadeLink[];
  unidadeId: string | null;
  from: Date;
  to: Date;
}): Map<string, string> {
  const { regras, vinculos, unidadeId, from, to } = params;
  const porRegra = new Map<string, string[]>();
  for (const v of vinculos) {
    const arr = porRegra.get(v.regra_id) ?? [];
    arr.push(v.unidade_id);
    porRegra.set(v.regra_id, arr);
  }

  const out = new Map<string, string>();
  for (const r of regras) {
    const unidades = porRegra.get(r.id) ?? [];
    if (unidades.length > 0) {
      if (!unidadeId) continue;
      if (!unidades.includes(unidadeId)) continue;
    }
    const datas = expandRegraNoIntervalo(r, from, to);
    for (const iso of datas) if (!out.has(iso)) out.set(iso, r.nome);
  }
  return out;
}
