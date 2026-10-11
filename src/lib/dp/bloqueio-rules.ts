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
    data_inicio?: string | null;
    alvo_tipo?: AlvoTipo | null;
    cargo_id?: string | null;
    setor_id?: string | null;
    colaborador_id?: string | null;
  } | null;
  ativo: boolean;
};

export type AlvoTipo = "todos" | "cargo" | "setor" | "colaborador";

/** Pessoa avaliada contra regras direcionadas (cargo/setor/colaborador). */
export type PessoaAlvo = { colaboradorId?: string | null; cargoId?: string | null; setorId?: string | null };

/**
 * A regra vale para esta pessoa? Regra "todos" (padrão) vale para todos.
 * Regras direcionadas só valem quando a pessoa casa com o alvo; em visões
 * gerais (sem pessoa) elas não bloqueiam o dia inteiro.
 * Espelha `private.dp_regra_bloqueia_colaborador`.
 */
export function regraAplicaPessoa(regra: Pick<RegraRow, "regra_json">, pessoa?: PessoaAlvo | null): boolean {
  const cfg = regra.regra_json ?? {};
  const alvo = cfg.alvo_tipo ?? "todos";
  if (alvo === "todos") return true;
  if (!pessoa) return false;
  if (alvo === "colaborador") return !!pessoa.colaboradorId && cfg.colaborador_id === pessoa.colaboradorId;
  if (alvo === "cargo") return !!pessoa.cargoId && cfg.cargo_id === pessoa.cargoId;
  if (alvo === "setor") return !!pessoa.setorId && cfg.setor_id === pessoa.setorId;
  return false;
}

/** Regra direcionada a cargo/setor/colaborador (bloqueio parcial). */
export const regraEhDirecionada = (regra: Pick<RegraRow, "regra_json">) =>
  (regra.regra_json?.alvo_tipo ?? "todos") !== "todos";

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

  const inicio = cfg.data_inicio
    ? (() => { const [y, m, dd] = String(cfg.data_inicio).split("-").map(Number); return y && m && dd ? new Date(y, m - 1, dd) : null; })()
    : null;
  const addIfInRange = (d: Date) => {
    if (d < from || d > to) return;
    if (inicio && d < inicio) return;
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
        if (ordinal === 0) {
          // Todas as ocorrências do dia da semana no mês
          for (let dia = 1 + shift; dia <= 31; dia += 7) {
            const d = new Date(ano, mes - 1, dia);
            if (d.getMonth() === mes - 1) addIfInRange(d);
          }
          continue;
        }
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
  /** Pessoa para regras direcionadas; sem ela, só regras de "todos" valem. */
  pessoa?: PessoaAlvo | null;
}): Map<string, string> {
  const { regras, vinculos, unidadeId, from, to, pessoa } = params;
  const porRegra = new Map<string, string[]>();
  for (const v of vinculos) {
    const arr = porRegra.get(v.regra_id) ?? [];
    arr.push(v.unidade_id);
    porRegra.set(v.regra_id, arr);
  }

  const out = new Map<string, string>();
  for (const r of regras) {
    const unidades = porRegra.get(r.id) ?? [];
    // unidadeId === null (admin visão global): inclui todas as regras.
    // unidadeId setado: inclui globais (sem vínculo) + vinculadas àquela unidade.
    if (unidades.length > 0 && unidadeId && !unidades.includes(unidadeId)) continue;
    if (!regraAplicaPessoa(r, pessoa)) continue;
    const datas = expandRegraNoIntervalo(r, from, to);
    for (const iso of datas) if (!out.has(iso)) out.set(iso, r.nome);
  }
  return out;
}

export type BloqueioOrigem = {
  motivo: string;
  /** true se pelo menos uma regra cobrindo a data é global (sem unidades vinculadas). */
  hasGlobal: boolean;
  /** true se pelo menos uma regra cobrindo a data é vinculada a alguma unidade. */
  hasUnidade: boolean;
  /** Unidades das regras por unidade que cobrem a data (vazio se só global). */
  unidadeIds: string[];
};

/**
 * Igual a `buildBloqueiosDeRegras`, mas devolve metadados para permitir
 * distinguir bloqueios de regra global x regra por unidade em cada data.
 */
export function buildBloqueiosDeRegrasDetalhado(params: {
  regras: RegraRow[];
  vinculos: RegraUnidadeLink[];
  unidadeId: string | null;
  from: Date;
  to: Date;
  /** Pessoa para regras direcionadas; sem ela, só regras de "todos" valem. */
  pessoa?: PessoaAlvo | null;
}): Map<string, BloqueioOrigem> {
  const { regras, vinculos, unidadeId, from, to, pessoa } = params;
  const porRegra = new Map<string, string[]>();
  for (const v of vinculos) {
    const arr = porRegra.get(v.regra_id) ?? [];
    arr.push(v.unidade_id);
    porRegra.set(v.regra_id, arr);
  }

  const out = new Map<string, BloqueioOrigem>();
  for (const r of regras) {
    const unidades = porRegra.get(r.id) ?? [];
    if (unidades.length > 0 && unidadeId && !unidades.includes(unidadeId)) continue;
    if (!regraAplicaPessoa(r, pessoa)) continue;
    const isGlobal = unidades.length === 0;
    const datas = expandRegraNoIntervalo(r, from, to);
    for (const iso of datas) {
      const cur = out.get(iso);
      if (!cur) {
        out.set(iso, {
          motivo: r.nome,
          hasGlobal: isGlobal,
          hasUnidade: !isGlobal,
          unidadeIds: [...unidades],
        });
      } else {
        cur.hasGlobal = cur.hasGlobal || isGlobal;
        cur.hasUnidade = cur.hasUnidade || !isGlobal;
        for (const u of unidades) if (!cur.unidadeIds.includes(u)) cur.unidadeIds.push(u);
      }
    }
  }
  return out;
}


export type DataBloqueadaRow = {
  id: string;
  data: string;
  motivo: string | null;
  liberada?: boolean | null;
  liberada_por_solicitacao?: string | null;
  unidade_id: string | null;
  regra_id?: string | null;
};

export type BloqueioEfetivo = { id: string | null; motivo: string; regra_id: string | null; /** Vale para todas as unidades (data geral ou regra sem unidades vinculadas). */ global?: boolean };

/**
 * Bloqueios efetivos de uma unidade, com a mesma precedência do Calendário de
 * Folgas: liberação (geral ou da unidade) vence; data manual vale; regra
 * recorrente (`dp_bloqueio_regras`) completa as datas restantes.
 */
export function bloqueiosEfetivosUnidade(params: {
  datas: DataBloqueadaRow[];
  regras: RegraRow[];
  vinculos: RegraUnidadeLink[];
  unidadeId: string | null;
  from: Date;
  to: Date;
}): Map<string, BloqueioEfetivo> {
  const { datas, regras, vinculos, unidadeId, from, to } = params;
  const liberadas = new Set<string>();
  const out = new Map<string, BloqueioEfetivo>();
  const daUnidade = (b: DataBloqueadaRow) => !b.unidade_id || !unidadeId || b.unidade_id === unidadeId;
  for (const b of datas) {
    if (!daUnidade(b)) continue;
    if (b.liberada === true || b.liberada_por_solicitacao != null) liberadas.add(b.data);
  }
  for (const b of datas) {
    if (!daUnidade(b) || liberadas.has(b.data)) continue;
    if (b.liberada === true || b.liberada_por_solicitacao != null) continue;
    const cur = out.get(b.data);
    // Bloqueio da própria unidade tem prioridade sobre o geral.
    if (!cur || (b.unidade_id && unidadeId === b.unidade_id)) {
      out.set(b.data, { id: b.id, motivo: b.motivo ?? "Data bloqueada", regra_id: b.regra_id ?? null, global: !b.unidade_id });
    }
  }
  buildBloqueiosDeRegras({ regras, vinculos, unidadeId, from, to }).forEach((motivo, iso) => {
    if (liberadas.has(iso) || out.has(iso)) return;
    const regra = regras.find((r) => r.nome === motivo);
    out.set(iso, { id: null, motivo, regra_id: regra?.id ?? "regra", global: !regra || !vinculos.some((v) => v.regra_id === regra.id) });
  });
  return out;
}
