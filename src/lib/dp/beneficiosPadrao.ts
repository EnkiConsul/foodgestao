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
  "beneficios",
] as const satisfies readonly (keyof RemuneracaoFormState)[];

export type CampoPadrao = (typeof CAMPOS_PADRAO)[number];

export type BeneficiosPadraoPayload = Partial<Pick<RemuneracaoFormState, CampoPadrao>>;

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
): Record<string, unknown> {
  const premio = !!payload.premio_assiduidade;
  const va = !!payload.vale_alimentacao;
  const vt = !!payload.vale_transporte;
  const consideraAtestado = premio ? !!payload.assiduidade_considera_atestado : true;
  return {
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
}
