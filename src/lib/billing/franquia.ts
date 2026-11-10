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
