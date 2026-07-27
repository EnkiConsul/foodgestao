// ------------------------------------------------------------------
// Domínio: DP → Configuração de trabalho do colaborador (Fase 2)
//
// A configuração responde "como este colaborador trabalha por padrão":
// em quais dias, com qual turno em cada dia e como é a folga semanal.
// A escala (Fase 3) nasce desta configuração, nunca o contrário.
//
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { LIMITE_SEMANAL, DIAS_SEMANA, ORDEM_EXIBICAO, formatarHoras } from "@/lib/dp/jornada-utils";
import { cargaLiquidaHoras, formatarFaixaTurno, type TurnoHorario } from "@/lib/dp/turno-utils";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

/** Turno resolvido para um dia da configuração (turno do dia ou o turno padrão). */
export interface TurnoResolvido extends TurnoHorario {
  id: string;
  nome: string;
  cor?: string | null;
}

export interface DiaConfig {
  dow: number;
  trabalha: boolean;
  /** Turno específico do dia. Quando ausente, vale o turno padrão da configuração. */
  turno_id: string | null;
}

export interface ConfigTrabalho {
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  folga_fixa_dow: number | null;
  dias: DiaConfig[];
}

export const DOW_LABEL = Object.fromEntries(DIAS_SEMANA.map((d) => [d.v, d.longo])) as Record<number, string>;
export const DOW_CURTO = Object.fromEntries(DIAS_SEMANA.map((d) => [d.v, d.curto])) as Record<number, string>;

/** Semana em branco: todos os dias marcados como trabalhados, sem turno específico. */
export function diasPadrao(): DiaConfig[] {
  return ORDEM_EXIBICAO.map((dow) => ({ dow, trabalha: true, turno_id: null }));
}

/** Aplica a folga fixa sobre a semana, garantindo 7 dias e ordem de exibição. */
export function normalizarDias(dias: DiaConfig[], folgaFixaDow?: number | null): DiaConfig[] {
  return ORDEM_EXIBICAO.map((dow) => {
    const atual = dias.find((d) => d.dow === dow);
    const base: DiaConfig = atual
      ? { dow, trabalha: atual.trabalha, turno_id: atual.turno_id }
      : { dow, trabalha: true, turno_id: null };
    if (folgaFixaDow != null && dow === folgaFixaDow) return { ...base, trabalha: false };
    return base;
  });
}

/** Turno efetivo do dia: o específico, senão o padrão da configuração. */
export function turnoDoDia(
  dia: DiaConfig,
  turnoPadraoId: string | null,
  turnos: TurnoResolvido[],
): TurnoResolvido | null {
  if (!dia.trabalha) return null;
  const id = dia.turno_id ?? turnoPadraoId;
  if (!id) return null;
  return turnos.find((t) => t.id === id) ?? null;
}

/** Carga semanal prevista, somando a carga líquida do turno de cada dia trabalhado. */
export function cargaSemanalConfig(config: ConfigTrabalho, turnos: TurnoResolvido[]): number {
  const total = config.dias.reduce((acc, dia) => {
    const turno = turnoDoDia(dia, config.turno_padrao_id, turnos);
    return turno ? acc + cargaLiquidaHoras(turno) : acc;
  }, 0);
  return Math.round(total * 100) / 100;
}

export function diasTrabalhados(config: ConfigTrabalho): number[] {
  return config.dias.filter((d) => d.trabalha).map((d) => d.dow);
}

export function diasDeFolga(config: ConfigTrabalho): number[] {
  return config.dias.filter((d) => !d.trabalha).map((d) => d.dow);
}

export interface ValidacaoConfig {
  campo: "dias" | "turno" | "folga" | "carga" | "vigencia";
  nivel: "erro" | "aviso";
  mensagem: string;
}

/**
 * Valida a configuração conforme o contrato do colaborador.
 * Contratos sem validação celetista (PJ/MEI/intermitente) não recebem
 * bloqueio de carga nem exigência de folga semanal.
 */
export function validarConfigTrabalho(
  config: ConfigTrabalho,
  turnos: TurnoResolvido[],
  opts?: { regime?: string | null; vigenciaInicio?: string | null; vigenciaFim?: string | null },
): ValidacaoConfig[] {
  const policy = contratoPolicy(opts?.regime);
  const out: ValidacaoConfig[] = [];
  const trabalhados = diasTrabalhados(config);

  if (trabalhados.length === 0) {
    out.push({ campo: "dias", nivel: "erro", mensagem: "Marque ao menos um dia de trabalho." });
  }

  const semTurno = config.dias.filter(
    (d) => d.trabalha && !turnoDoDia(d, config.turno_padrao_id, turnos),
  );
  if (semTurno.length > 0) {
    out.push({
      campo: "turno",
      nivel: "erro",
      mensagem: `Sem turno definido em: ${semTurno.map((d) => DOW_CURTO[d.dow]).join(", ")}. Escolha um turno padrão ou um turno para cada dia.`,
    });
  }

  if (policy.exigeFolgaSemanal && !config.folga_variavel && diasDeFolga(config).length === 0) {
    out.push({
      campo: "folga",
      nivel: "erro",
      mensagem: "Defina ao menos um dia de folga na semana ou marque a folga como variável conforme a escala.",
    });
  }

  if (policy.validaCargaSemanal) {
    const carga = cargaSemanalConfig(config, turnos);
    if (carga > LIMITE_SEMANAL) {
      out.push({
        campo: "carga",
        nivel: "erro",
        mensagem: `Carga semanal de ${formatarHoras(carga)} excede o limite de ${LIMITE_SEMANAL}h.`,
      });
    } else if (carga > LIMITE_SEMANAL - 4) {
      out.push({
        campo: "carga",
        nivel: "aviso",
        mensagem: `Carga semanal de ${formatarHoras(carga)} — pouca folga até o limite de ${LIMITE_SEMANAL}h.`,
      });
    }
  }

  if (opts?.vigenciaInicio && opts?.vigenciaFim && opts.vigenciaFim < opts.vigenciaInicio) {
    out.push({ campo: "vigencia", nivel: "erro", mensagem: "O fim da vigência é anterior ao início." });
  }

  return out;
}

export function configTemErro(v: ValidacaoConfig[]): boolean {
  return v.some((x) => x.nivel === "erro");
}

/** Texto curto para listas: "Seg–Sáb · 17:00 → 23:00 · folga: domingo". */
export function resumoConfigTexto(config: ConfigTrabalho, turnos: TurnoResolvido[]): string {
  const trabalhados = diasTrabalhados(config);
  if (trabalhados.length === 0) return "Nenhum dia de trabalho definido";

  const partes: string[] = [
    trabalhados.map((d) => DOW_CURTO[d]).join(", "),
  ];

  const usados = new Map<string, TurnoResolvido>();
  for (const dia of config.dias) {
    const t = turnoDoDia(dia, config.turno_padrao_id, turnos);
    if (t) usados.set(t.id, t);
  }
  if (usados.size === 1) {
    const t = [...usados.values()][0];
    partes.push(formatarFaixaTurno(t));
  } else if (usados.size > 1) {
    partes.push(`${usados.size} turnos diferentes`);
  }

  const folgas = diasDeFolga(config);
  if (config.folga_variavel) partes.push("folga variável conforme escala");
  else if (folgas.length) partes.push(`folga: ${folgas.map((d) => DOW_CURTO[d]).join(", ")}`);

  return partes.join(" · ");
}
