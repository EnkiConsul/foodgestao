// ------------------------------------------------------------------
// Domínio: DP → Padrão de benefícios por unidade.
//
// Assiduidade, tolerância, vale-alimentação, vale-transporte e a ficha de
// benefícios são, na prática, iguais para todo o time de uma unidade (mesma
// negociação coletiva). O primeiro colaborador cadastrado define o padrão e os
// próximos já nascem pré-preenchidos. O padrão da unidade tem prioridade sobre
// o padrão geral da empresa. Ao salvar, o usuário escolhe o alcance: só os
// próximos cadastros ou também os colaboradores ativos já cadastrados.
// ------------------------------------------------------------------

import { numeroBR, type RemuneracaoFormState } from "@/components/dp/RemuneracaoFields";

/** Campos que fazem parte do padrão (salário/hora nunca entram: são do cargo). */
export const CAMPOS_PADRAO = [
  "vale_transporte",
  "vale_transporte_valor_dia",
  "vale_transporte_dia_pagamento",
  "vale_transporte_dias_corte",
  "vale_transporte_desconta_falta",
  "vale_transporte_desconta_folga_extra",
  "vale_transporte_desconta_atestado",
  "vale_transporte_desconta_ferias",
  "premio_assiduidade",
  "premio_assiduidade_valor",
  "premio_assiduidade_tipo",
  "assiduidade_criterio",
  "assiduidade_tolerancia_min",
  "assiduidade_max_atrasos",
  "assiduidade_considera_atestado",
  "assiduidade_max_atestados",
  "vale_alimentacao",
  "vale_alimentacao_valor",
  "vale_alimentacao_periodicidade",
  "vale_alimentacao_dias_base",
  "vale_alimentacao_dias_origem",
  "vale_alimentacao_desconto_tipo",
  "vale_alimentacao_desconto_valor",
  "vale_alimentacao_dia_pagamento",
  "vale_alimentacao_dias_corte",
  "vale_alimentacao_desconta_falta",
  "vale_alimentacao_desconta_folga_extra",
  "vale_alimentacao_desconta_atestado",
  "vale_alimentacao_desconta_ferias",
  "beneficios",
] as const satisfies readonly (keyof RemuneracaoFormState)[];

export type CampoPadrao = (typeof CAMPOS_PADRAO)[number];

export type BeneficiosPadraoPayload = Partial<Pick<RemuneracaoFormState, CampoPadrao>>;

/** Grupos que o usuário pode escolher replicar (ou não) ao salvar o padrão. */
export type GrupoPadrao = "assiduidade" | "vale_alimentacao" | "vale_transporte" | "beneficios";

export const GRUPOS_PADRAO: readonly GrupoPadrao[] = [
  "assiduidade",
  "vale_alimentacao",
  "vale_transporte",
  "beneficios",
] as const;

export const ROTULOS_GRUPO: Record<GrupoPadrao, string> = {
  assiduidade: "Prêmio de assiduidade",
  vale_alimentacao: "Vale-alimentação",
  vale_transporte: "Vale-transporte",
  beneficios: "Ficha de benefícios",
};

/** Quais campos do padrão pertencem a cada grupo. */
export const CAMPOS_POR_GRUPO: Record<GrupoPadrao, readonly CampoPadrao[]> = {
  assiduidade: [
    "premio_assiduidade",
    "premio_assiduidade_valor",
    "premio_assiduidade_tipo",
    "assiduidade_criterio",
    "assiduidade_tolerancia_min",
    "assiduidade_max_atrasos",
    "assiduidade_considera_atestado",
    "assiduidade_max_atestados",
  ],
  vale_alimentacao: [
    "vale_alimentacao",
    "vale_alimentacao_valor",
    "vale_alimentacao_periodicidade",
    "vale_alimentacao_dias_base",
    "vale_alimentacao_dias_origem",
    "vale_alimentacao_desconto_tipo",
    "vale_alimentacao_desconto_valor",
  ],
  vale_transporte: ["vale_transporte", "vale_transporte_valor_dia"],
  beneficios: ["beneficios"],
};

const grupoDoCampo = (campo: CampoPadrao): GrupoPadrao =>
  (GRUPOS_PADRAO.find((g) => CAMPOS_POR_GRUPO[g].includes(campo)) ?? "beneficios");

/** Recorta o padrão deixando apenas os campos dos grupos escolhidos. */
export function filtrarPadraoPorGrupos(
  payload: BeneficiosPadraoPayload,
  grupos: readonly GrupoPadrao[],
): BeneficiosPadraoPayload {
  const permitidos = new Set(grupos.flatMap((g) => CAMPOS_POR_GRUPO[g]));
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_PADRAO) {
    if (!permitidos.has(campo)) continue;
    out[campo] = (payload as Record<string, unknown>)[campo];
  }
  return out as BeneficiosPadraoPayload;
}

/**
 * Mescla no padrão gravado apenas os grupos escolhidos: o que não foi marcado
 * continua exatamente como já estava naquele escopo.
 */
export function mesclarPadrao(
  base: BeneficiosPadraoPayload | null | undefined,
  novo: BeneficiosPadraoPayload,
  grupos: readonly GrupoPadrao[],
): BeneficiosPadraoPayload {
  return { ...(base ?? {}), ...filtrarPadraoPorGrupos(novo, grupos) };
}


export interface BeneficiosPadraoLinha {
  id?: string;
  unidade_id?: string | null;
  cargo_id?: string | null;
  payload: BeneficiosPadraoPayload;
  updated_at?: string | null;
}

/** Alcance de gravação do padrão escolhido pelo usuário. */
export type PadraoEscopo = "colaborador" | "cargo" | "unidade" | "empresa";

/** Recorta do formulário apenas os campos que compõem o padrão. */
export function extrairPadrao(rem: RemuneracaoFormState): BeneficiosPadraoPayload {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_PADRAO) out[campo] = rem[campo];
  return out as BeneficiosPadraoPayload;
}

/** Campos booleanos: ausentes em padrões antigos valem como "não" (e não diferença). */
const CAMPOS_BOOLEANOS = new Set<CampoPadrao>([
  "vale_transporte",
  "premio_assiduidade",
  "vale_alimentacao",
  "assiduidade_considera_atestado",
]);

/**
 * Normaliza um padrão para comparação: vazio/null/zero viram o mesmo "não
 * informado" e números escritos como texto ("24", "24,00") convergem.
 * Necessário porque o banco devolve o JSON com as chaves em outra ordem.
 */
export function normalizarPadrao(
  payload: BeneficiosPadraoPayload | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!payload) return out;
  for (const campo of CAMPOS_PADRAO) {
    const valor = (payload as Record<string, unknown>)[campo];
    if (campo === "beneficios") {
      const marcados = Object.entries((valor ?? {}) as Record<string, unknown>)
        .filter(([, v]) => !!v)
        .map(([k]) => k)
        .sort();
      out[campo] = marcados;
      continue;
    }
    if (CAMPOS_BOOLEANOS.has(campo)) { out[campo] = !!valor; continue; }
    if (typeof valor === "boolean") { out[campo] = valor; continue; }
    if (valor === undefined || valor === null || valor === "") { out[campo] = null; continue; }
    const texto = String(valor).trim().replace(",", ".");
    const numero = Number(texto);
    if (texto !== "" && Number.isFinite(numero)) {
      out[campo] = numero === 0 ? null : numero;
      continue;
    }
    out[campo] = texto;
  }
  return out;
}

/** Dois padrões são equivalentes na prática? (ignora ordem de chaves e formato) */
export function padroesIguais(
  a: BeneficiosPadraoPayload | null | undefined,
  b: BeneficiosPadraoPayload | null | undefined,
): boolean {
  const na = normalizarPadrao(a);
  const nb = normalizarPadrao(b);
  return CAMPOS_PADRAO.every((campo) => JSON.stringify(na[campo]) === JSON.stringify(nb[campo]));
}

/** Assinatura estável de um padrão, usada para "já respondi por este conjunto". */
export function assinaturaPadrao(payload: BeneficiosPadraoPayload | null | undefined): string {
  const n = normalizarPadrao(payload);
  return JSON.stringify(CAMPOS_PADRAO.map((c) => n[c]));
}

/** Precedência: cargo na unidade → unidade → empresa. */
export function resolverPadrao(
  linhas: BeneficiosPadraoLinha[] | null | undefined,
  unidadeId: string | null | undefined,
  cargoId?: string | null,
): BeneficiosPadraoLinha | null {
  const lista = linhas ?? [];
  if (unidadeId && cargoId) {
    const doCargo = lista.find((l) => l.unidade_id === unidadeId && l.cargo_id === cargoId);
    if (doCargo) return doCargo;
  }
  const daUnidade = unidadeId
    ? lista.find((l) => l.unidade_id === unidadeId && !l.cargo_id)
    : null;
  if (daUnidade) return daUnidade;
  return lista.find((l) => !l.unidade_id && !l.cargo_id) ?? null;
}

/** Todos os padrões que se aplicam a este colaborador (cargo, unidade e empresa). */
export function padroesAplicaveis(
  linhas: BeneficiosPadraoLinha[] | null | undefined,
  unidadeId: string | null | undefined,
  cargoId?: string | null,
): BeneficiosPadraoLinha[] {
  const lista = linhas ?? [];
  const out: BeneficiosPadraoLinha[] = [];
  if (unidadeId && cargoId) {
    const doCargo = lista.find((l) => l.unidade_id === unidadeId && l.cargo_id === cargoId);
    if (doCargo) out.push(doCargo);
  }
  if (unidadeId) {
    const daUnidade = lista.find((l) => l.unidade_id === unidadeId && !l.cargo_id);
    if (daUnidade) out.push(daUnidade);
  }
  const daEmpresa = lista.find((l) => !l.unidade_id && !l.cargo_id);
  if (daEmpresa) out.push(daEmpresa);
  return out;
}

/**
 * O conteúdo da tela já bate com algum padrão vigente (cargo, unidade ou
 * empresa)? Se sim, não há o que perguntar — o usuário está apenas repetindo
 * uma decisão que já existe em algum nível.
 */
export function padroesIguaisAlgum(
  atual: BeneficiosPadraoPayload | null | undefined,
  linhas: BeneficiosPadraoLinha[] | null | undefined,
  escopo: { unidadeId?: string | null; cargoId?: string | null } = {},
): boolean {
  return padroesAplicaveis(linhas, escopo.unidadeId, escopo.cargoId).some((l) =>
    padroesIguais(atual, l.payload),
  );
}

/** Nível de onde veio o padrão resolvido, para rótulo na tela. */
export function nivelPadrao(linha: BeneficiosPadraoLinha | null | undefined): PadraoEscopo | null {
  if (!linha) return null;
  if (linha.cargo_id) return "cargo";
  if (linha.unidade_id) return "unidade";
  return "empresa";
}

/** Rótulos em português dos campos do padrão, para explicar diferenças. */
const ROTULOS: Record<CampoPadrao, string> = {
  vale_transporte: "Vale-transporte",
  vale_transporte_valor_dia: "Vale-transporte por dia",
  premio_assiduidade: "Prêmio de assiduidade",
  premio_assiduidade_valor: "Valor da assiduidade",
  premio_assiduidade_tipo: "Tipo da assiduidade",
  assiduidade_criterio: "Critério da assiduidade",
  assiduidade_tolerancia_min: "Tolerância (min)",
  assiduidade_max_atrasos: "Máximo de atrasos",
  assiduidade_considera_atestado: "Considera atestado",
  assiduidade_max_atestados: "Máximo de atestados",
  vale_alimentacao: "Vale-alimentação",
  vale_alimentacao_valor: "Valor do vale-alimentação",
  vale_alimentacao_periodicidade: "Periodicidade do VA",
  vale_alimentacao_dias_base: "Dias base do VA",
  vale_alimentacao_dias_origem: "Origem dos dias do VA",
  vale_alimentacao_desconto_tipo: "Tipo de desconto do VA",
  vale_alimentacao_desconto_valor: "Valor do desconto do VA",
  beneficios: "Ficha de benefícios",
};

export interface DiferencaPadrao {
  campo: CampoPadrao;
  rotulo: string;
  padrao: string;
  atual: string;
}

const paraTexto = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
};

/** Diferenças entre o que está na tela e um padrão gravado. */
export function diferencasPadrao(
  atual: BeneficiosPadraoPayload | null | undefined,
  padrao: BeneficiosPadraoPayload | null | undefined,
): DiferencaPadrao[] {
  const na = normalizarPadrao(atual);
  const np = normalizarPadrao(padrao);
  return CAMPOS_PADRAO.filter(
    (campo) => JSON.stringify(na[campo]) !== JSON.stringify(np[campo]),
  ).map((campo) => ({
    campo,
    rotulo: ROTULOS[campo],
    padrao: paraTexto(np[campo]),
    atual: paraTexto(na[campo]),
  }));
}



/** Grupos em que a tela divergiu do padrão de referência. */
export function gruposComDiferenca(
  atual: BeneficiosPadraoPayload | null | undefined,
  referencia: BeneficiosPadraoPayload | null | undefined,
): GrupoPadrao[] {
  const grupos = new Set<GrupoPadrao>();
  for (const d of diferencasPadrao(atual, referencia)) grupos.add(grupoDoCampo(d.campo));
  return GRUPOS_PADRAO.filter((g) => grupos.has(g));
}

/** Resumo curto do que será gravado em um grupo, para mostrar no diálogo. */
export function resumoGrupo(
  payload: BeneficiosPadraoPayload | null | undefined,
  grupo: GrupoPadrao,
): string {
  const p = payload ?? {};
  if (grupo === "assiduidade") {
    if (!p.premio_assiduidade) return "Sem prêmio";
    const unidade = p.premio_assiduidade_tipo === "percentual" ? "%" : "R$";
    const partes = [`Prêmio ${unidade} ${p.premio_assiduidade_valor || "0"}`];
    if (p.assiduidade_criterio) partes.push(String(p.assiduidade_criterio).replace(/_/g, " "));
    if (p.assiduidade_max_atrasos) partes.push(`${p.assiduidade_max_atrasos} atraso(s)`);
    if (p.assiduidade_tolerancia_min) partes.push(`tolerância ${p.assiduidade_tolerancia_min} min`);
    if (p.assiduidade_considera_atestado) {
      partes.push(`atestado conta (máx. ${p.assiduidade_max_atestados || 0})`);
    }
    return partes.join(" • ");
  }
  if (grupo === "vale_alimentacao") {
    if (!p.vale_alimentacao) return "Sem vale-alimentação";
    const per = p.vale_alimentacao_periodicidade === "diario" ? "por dia" : "por mês";
    const partes = [`R$ ${p.vale_alimentacao_valor || "0,00"} ${per}`];
    if (p.vale_alimentacao_periodicidade === "diario") {
      partes.push(
        p.vale_alimentacao_dias_origem === "jornada"
          ? "dias pela jornada"
          : `${p.vale_alimentacao_dias_base || 22} dias fixos`,
      );
    }
    if ((p.vale_alimentacao_desconto_tipo ?? "nenhum") !== "nenhum") {
      partes.push(`desconto ${p.vale_alimentacao_desconto_valor || 0}`);
    }
    return partes.join(" • ");
  }
  if (grupo === "vale_transporte") {
    if (!p.vale_transporte) return "Sem vale-transporte";
    return `R$ ${p.vale_transporte_valor_dia || "0,00"} por dia`;
  }
  const marcados = Object.values(p.beneficios ?? {}).filter(Boolean).length;
  return marcados ? `${marcados} benefício(s) marcado(s)` : "Nenhum benefício marcado";
}

/** Mescla o padrão no formulário, mantendo apenas campos conhecidos. */
export function aplicarPadrao(
  rem: RemuneracaoFormState,
  payload: BeneficiosPadraoPayload | null | undefined,
): RemuneracaoFormState {
  if (!payload) return rem;
  const patch: Record<string, unknown> = {};
  for (const campo of CAMPOS_PADRAO) {
    const valor = (payload as Record<string, unknown>)[campo];
    if (valor === undefined || valor === null) continue;
    patch[campo] = valor;
  }
  return { ...rem, ...(patch as Partial<RemuneracaoFormState>) };
}

/** O padrão traz alguma informação útil? (evita salvar padrão vazio) */
export function padraoTemConteudo(payload: BeneficiosPadraoPayload | null | undefined): boolean {
  if (!payload) return false;
  const beneficiosMarcados = Object.values(payload.beneficios ?? {}).some(Boolean);
  return !!payload.vale_transporte || !!payload.vale_alimentacao || !!payload.premio_assiduidade
    || beneficiosMarcados;
}

/** Resumo curto para telas de configuração. */
export function resumoPadrao(payload: BeneficiosPadraoPayload | null | undefined): string[] {
  if (!payload) return [];
  const itens: string[] = [];
  if (payload.vale_transporte) {
    itens.push(`Vale-transporte R$ ${payload.vale_transporte_valor_dia || "0,00"}/dia`);
  }
  if (payload.vale_alimentacao) {
    const per = payload.vale_alimentacao_periodicidade === "diario" ? "por dia" : "por mês";
    itens.push(`Vale-alimentação R$ ${payload.vale_alimentacao_valor || "0,00"} ${per}`);
  }
  if (payload.premio_assiduidade) {
    const unidade = payload.premio_assiduidade_tipo === "percentual" ? "%" : "R$";
    itens.push(`Assiduidade ${unidade} ${payload.premio_assiduidade_valor || "0"}`);
  }
  if (payload.assiduidade_tolerancia_min) {
    itens.push(`Tolerância de ${payload.assiduidade_tolerancia_min} min`);
  }
  const marcados = Object.values(payload.beneficios ?? {}).filter(Boolean).length;
  if (marcados > 0) itens.push(`${marcados} benefício(s) da ficha`);
  return itens;
}

/** Alcance da gravação: só os próximos cadastros ou também quem já existe. */
export type PadraoAlcance = "novos" | "todos";

const inteiro = (v: unknown): number => {
  const n = numeroBR(String(v ?? ""));
  return Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
};

const decimal = (v: unknown): number => {
  const n = numeroBR(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Converte o padrão nas colunas de `dp_colaboradores`, com as mesmas regras de
 * coerência do formulário (prêmio desligado zera critério/limites, VA desligado
 * zera valor). `beneficios` não entra aqui: vive em `dp_colaborador_beneficios`.
 */
export function padraoParaColunasColaborador(
  payload: BeneficiosPadraoPayload,
  grupos: readonly GrupoPadrao[] = GRUPOS_PADRAO,
): Record<string, unknown> {
  const premio = !!payload.premio_assiduidade;
  const va = !!payload.vale_alimentacao;
  const vt = !!payload.vale_transporte;
  const consideraAtestado = premio ? !!payload.assiduidade_considera_atestado : true;
  const permitidos = new Set(grupos.flatMap((g) => CAMPOS_POR_GRUPO[g] as readonly string[]));
  const todas: Record<string, unknown> = {
    vale_transporte: vt,
    vale_transporte_valor_dia: vt ? decimal(payload.vale_transporte_valor_dia) : null,

    premio_assiduidade: premio,
    premio_assiduidade_valor: premio ? decimal(payload.premio_assiduidade_valor) || null : null,
    premio_assiduidade_tipo: premio ? (payload.premio_assiduidade_tipo ?? "valor") : "valor",
    assiduidade_criterio: premio ? (payload.assiduidade_criterio ?? null) : null,
    assiduidade_tolerancia_min: inteiro(payload.assiduidade_tolerancia_min),
    assiduidade_max_atrasos: premio ? inteiro(payload.assiduidade_max_atrasos) : null,
    assiduidade_considera_atestado: consideraAtestado,
    assiduidade_max_atestados:
      premio && consideraAtestado ? inteiro(payload.assiduidade_max_atestados) : null,

    vale_alimentacao: va,
    vale_alimentacao_valor: va ? decimal(payload.vale_alimentacao_valor) || null : null,
    vale_alimentacao_periodicidade: payload.vale_alimentacao_periodicidade ?? "mensal",
    vale_alimentacao_dias_base: inteiro(payload.vale_alimentacao_dias_base) || 22,
    vale_alimentacao_dias_origem: payload.vale_alimentacao_dias_origem ?? "jornada",
    vale_alimentacao_desconto_tipo: payload.vale_alimentacao_desconto_tipo ?? "nenhum",
    vale_alimentacao_desconto_valor:
      (payload.vale_alimentacao_desconto_tipo ?? "nenhum") === "nenhum"
        ? 0
        : decimal(payload.vale_alimentacao_desconto_valor),
  };
  return Object.fromEntries(Object.entries(todas).filter(([k]) => permitidos.has(k)));
}

/** Uma diferença entre o cadastro gravado do colaborador e o padrão vigente. */
export interface DivergenciaColaborador {
  coluna: string;
  rotulo: string;
  grupo: GrupoPadrao;
  padrao: string;
  atual: string;
}

/** Compara nulo/zero/"": para o usuário, "não informado" é tudo a mesma coisa. */
const equivalente = (a: unknown, b: unknown): boolean => {
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v;
    const n = Number(String(v).replace(",", "."));
    if (Number.isFinite(n)) return n === 0 ? null : n;
    return String(v);
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};

/**
 * Diferenças entre as colunas gravadas de um colaborador e o padrão vigente.
 * Usa as mesmas regras de coerência da replicação, então o que aparece aqui é
 * exatamente o que a sincronização vai gravar.
 */
export function divergenciasColaboradorVsPadrao(
  colaborador: Record<string, unknown> | null | undefined,
  payload: BeneficiosPadraoPayload | null | undefined,
  grupos: readonly GrupoPadrao[] = GRUPOS_PADRAO,
): DivergenciaColaborador[] {
  if (!colaborador || !payload) return [];
  // A ficha de benefícios vive em outra tabela: não é comparável por coluna.
  const gruposColunas = grupos.filter((g) => g !== "beneficios");
  if (!gruposColunas.length) return [];
  const esperadas = padraoParaColunasColaborador(payload, gruposColunas);
  const out: DivergenciaColaborador[] = [];
  for (const [coluna, esperado] of Object.entries(esperadas)) {
    const atual = colaborador[coluna];
    if (equivalente(atual, esperado)) continue;
    const campo = coluna as CampoPadrao;
    out.push({
      coluna,
      rotulo: ROTULOS[campo] ?? coluna,
      grupo: grupoDoCampo(campo),
      padrao: paraTexto(esperado ?? null),
      atual: paraTexto(atual ?? null),
    });
  }
  return out;
}
