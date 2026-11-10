/**
 * Franquia de colaboradores do Pessoas 360°: leitura da prévia do servidor
 * (`dp_colaborador_excedente_previa`) para avisar ANTES de preencher o cadastro.
 * O banco continua sendo a trava final (gatilho de limite).
 */

export interface SugestaoUpgrade {
  plano: string;
  nome: string;
  unitario_cents: number;
  minimo: number;
  /** Mensalidade no plano atual já com 1 colaborador a mais (base + excedentes). */
  valor_atual_cents: number;
  /** Mensalidade no Enterprise com 1 colaborador a mais. */
  valor_enterprise_cents: number;
}

export interface PreviaFranquia {
  modo: "v2" | "legado" | string;
  pode_gerir: boolean;
  atual: number;
  limite: number;
  isento: boolean;
  valor_unit_cents: number;
  plano?: string | null;
  plano_nome?: string | null;
  por_colaborador_cents?: number | null;
  /** Mínimo cobrado no plano por colaborador (Enterprise: 19). */
  minimo_colaboradores?: number | null;
  /** Assinatura em teste grátis: nada é cobrado até o fim do teste. */
  em_teste?: boolean | null;
  teste_termina_em?: string | null;
  sugestao_upgrade?: SugestaoUpgrade | null;
}

export interface ComparativoEnterprise {
  plano: string;
  nome: string;
  valorAtualCents: number;
  valorEnterpriseCents: number;
  economiaCents: number;
  compensa: boolean;
}

export type EstadoFranquia =
  | { tipo: "livre"; vagas: number | null }
  | { tipo: "por_colaborador"; unitarioCents: number; atual: number }
  /** Teste grátis de plano por colaborador: sem custo agora, sem franquia a confirmar. */
  | {
      tipo: "teste";
      unitarioCents: number;
      minimo: number;
      atual: number;
      planoNome: string | null;
      terminaEm: string | null;
    }
  | {
      tipo: "excedente";
      atual: number;
      limite: number;
      excedentes: number;
      valorUnitCents: number;
      enterprise: ComparativoEnterprise | null;
    }
  | {
      tipo: "bloqueado";
      motivo: "sem_permissao" | "legado";
      atual: number;
      limite: number;
      enterprise: ComparativoEnterprise | null;
    };

const ERROS_FRANQUIA: Array<[RegExp, string]> = [
  [/EXCEDENTE_SEM_PERMISSAO/,
    "A franquia de colaboradores do plano está completa. Só o dono ou um administrador da empresa pode incluir colaboradores acima da franquia — o que você preencheu continua aqui."],
  [/EXCEDENTE_CONFIRMACAO_NECESSARIA/,
    "Este cadastro passa da franquia de colaboradores do plano. Toque em salvar de novo e confirme o valor do excedente — o que você preencheu continua aqui."],
  [/Limite do plano atingido/i,
    "A franquia de colaboradores do plano está completa. Amplie o plano para incluir mais colaboradores — o que você preencheu continua aqui."],
];

/** Travas de franquia do banco (gatilho de limite) em linguagem do gestor; null se não for de franquia. */
export function mensagemErroFranquia(texto: string | null | undefined): string | null {
  const t = String(texto ?? "");
  return ERROS_FRANQUIA.find(([re]) => re.test(t))?.[1] ?? null;
}

/** Erro do banco pede a ciência do excedente (cadastro, reativação ou recontratação). */
export function pedeCienciaExcedente(texto: string | null | undefined): boolean {
  return /EXCEDENTE_CONFIRMACAO_NECESSARIA/.test(String(texto ?? ""));
}

/** Comparativo plano atual × Enterprise para `novos` colaboradores a mais. */
export function comparativoEnterprise(previa: PreviaFranquia, novos = 1): ComparativoEnterprise | null {
  const s = previa.sugestao_upgrade;
  if (!s) return null;
  const n = Math.max(1, Math.floor(novos));
  const valorAtual = s.valor_atual_cents + (n - 1) * Number(previa.valor_unit_cents ?? 0);
  const valorEnterprise = Math.max(s.minimo, previa.atual + n) * s.unitario_cents;
  return {
    plano: s.plano,
    nome: s.nome,
    valorAtualCents: valorAtual,
    valorEnterpriseCents: valorEnterprise,
    economiaCents: valorAtual - valorEnterprise,
    compensa: valorEnterprise <= valorAtual,
  };
}

export function avaliarFranquia(previa: PreviaFranquia | null | undefined, novos = 1): EstadoFranquia {
  if (!previa || novos <= 0) return { tipo: "livre", vagas: null };
  const atual = Number(previa.atual ?? 0);
  const limite = Number(previa.limite ?? -1);
  if (previa.isento) return { tipo: "livre", vagas: null };
  const unit = Number(previa.por_colaborador_cents ?? 0);
  if (unit > 0 && previa.em_teste) {
    return {
      tipo: "teste",
      unitarioCents: unit,
      minimo: Math.max(1, Number(previa.minimo_colaboradores ?? 1)),
      atual,
      planoNome: previa.plano_nome ?? null,
      terminaEm: previa.teste_termina_em ?? null,
    };
  }
  if (unit > 0) return { tipo: "por_colaborador", unitarioCents: unit, atual };
  if (limite < 0) return { tipo: "livre", vagas: null };
  if (atual + novos <= limite) return { tipo: "livre", vagas: limite - atual };

  const enterprise = comparativoEnterprise(previa, novos);
  if (previa.modo !== "v2") return { tipo: "bloqueado", motivo: "legado", atual, limite, enterprise };
  if (!previa.pode_gerir) return { tipo: "bloqueado", motivo: "sem_permissao", atual, limite, enterprise };
  return {
    tipo: "excedente",
    atual,
    limite,
    excedentes: Math.min(novos, atual + novos - limite),
    valorUnitCents: Number(previa.valor_unit_cents ?? 0),
    enterprise,
  };
}
