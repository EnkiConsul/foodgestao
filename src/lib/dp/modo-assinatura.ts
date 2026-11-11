/**
 * Modo de assinatura de documentos do colaborador: no celular (portal) ou em
 * papel (via impressa assinada à mão). Cada troca é um registro com data de
 * início; vale o mais recente já iniciado. Sem registro, assina no celular.
 *
 * Quem decide no documento é o servidor (no momento da emissão): estas
 * funções só explicam e sinalizam na tela.
 */

export type ModoAssinatura = "digital" | "fisica";

export type RegistroModoAssinatura = {
  id?: string;
  colaborador_id: string;
  modo: ModoAssinatura;
  /** AAAA-MM-DD */
  vigente_desde: string;
  motivo?: string | null;
  origem?: string | null;
  documentos_convertidos?: number | null;
  created_at: string;
  created_by?: string | null;
};

export const ROTULO_MODO: Record<ModoAssinatura, string> = {
  digital: "Celular (portal)",
  fisica: "Papel (via impressa)",
};

/** Hoje no fuso de Brasília (AAAA-MM-DD), mesmo dia usado pelo servidor. */
export function hojeBrasilia(base: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(base);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

function ordenados(historico: RegistroModoAssinatura[]): RegistroModoAssinatura[] {
  return [...historico].sort((a, b) =>
    a.vigente_desde === b.vigente_desde
      ? b.created_at.localeCompare(a.created_at)
      : b.vigente_desde.localeCompare(a.vigente_desde),
  );
}

/** Modo que vale numa data: o registro mais recente com início até essa data. */
export function modoAssinaturaEm(historico: RegistroModoAssinatura[], data: string): ModoAssinatura {
  const r = ordenados(historico).find((h) => h.vigente_desde <= data);
  return r?.modo ?? "digital";
}

export type SituacaoModoAssinatura = {
  atual: ModoAssinatura;
  /** Desde quando vale o modo atual (null = padrão, nunca alterado). */
  desde: string | null;
  /** Troca já agendada para depois de hoje. */
  proxima: { modo: ModoAssinatura; desde: string } | null;
};

export function situacaoModoAssinatura(
  historico: RegistroModoAssinatura[],
  hoje: string = hojeBrasilia(),
): SituacaoModoAssinatura {
  const lista = ordenados(historico);
  const vigente = lista.find((h) => h.vigente_desde <= hoje) ?? null;
  const atual = vigente?.modo ?? "digital";
  // Próxima troca: a primeira data futura cujo modo difere do atual.
  const futuras = lista
    .filter((h) => h.vigente_desde > hoje)
    .map((h) => h.vigente_desde)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort();
  let proxima: SituacaoModoAssinatura["proxima"] = null;
  for (const d of futuras) {
    const m = modoAssinaturaEm(historico, d);
    if (m !== atual) { proxima = { modo: m, desde: d }; break; }
  }
  return { atual, desde: vigente?.vigente_desde ?? null, proxima };
}

/** Agrupa o histórico da empresa por colaborador. */
export function agruparPorColaborador(registros: RegistroModoAssinatura[]): Map<string, RegistroModoAssinatura[]> {
  const m = new Map<string, RegistroModoAssinatura[]>();
  for (const r of registros) {
    const l = m.get(r.colaborador_id) ?? [];
    l.push(r);
    m.set(r.colaborador_id, l);
  }
  return m;
}

/** Assina em papel hoje? (selo e filtro da lista da equipe). */
export function assinaEmPapelHoje(historico: RegistroModoAssinatura[] | undefined, hoje: string = hojeBrasilia()): boolean {
  return !!historico && modoAssinaturaEm(historico, hoje) === "fisica";
}

/**
 * Canal sugerido para um recibo: quem assina em papel começa em "Assinatura à
 * mão"; o portal fica fechado para essa pessoa e o WhatsApp segue como exceção.
 */
export function canaisReciboParaModo(modo: ModoAssinatura): {
  padrao: "portal" | "fisico";
  portalPermitido: boolean;
} {
  return modo === "fisica"
    ? { padrao: "fisico", portalPermitido: false }
    : { padrao: "portal", portalPermitido: true };
}

const MENSAGENS: Record<string, string> = {
  UNAUTHENTICATED: "Entre na sua conta para continuar.",
  FORBIDDEN: "Você não tem permissão para alterar o cadastro deste colaborador.",
  NOT_FOUND: "Colaborador não encontrado.",
  MODO_ASSINATURA_INVALIDO: "Escolha como o colaborador assina os documentos.",
  MODO_ASSINATURA_DATA_OBRIGATORIA: "Informe a partir de quando vale.",
  MODO_ASSINATURA_ANTES_ADMISSAO: "A data não pode ser anterior à admissão.",
  MODO_ASSINATURA_DATA_DISTANTE: "Escolha uma data dentro dos próximos 12 meses.",
  MODO_ASSINATURA_MOTIVO_LONGO: "O motivo pode ter no máximo 500 caracteres.",
};

export function mensagemErroModoAssinatura(erro: unknown): string {
  const bruto = erro instanceof Error ? erro.message : String((erro as { message?: string } | null)?.message ?? erro ?? "");
  for (const [codigo, texto] of Object.entries(MENSAGENS)) if (bruto.includes(codigo)) return texto;
  return bruto || "Não foi possível salvar agora.";
}
