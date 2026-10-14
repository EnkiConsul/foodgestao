/**
 * Converte a configuração de trabalho cadastrada em jornadas da calculadora.
 * Função pura: não lê banco, não grava nada e nunca inventa horário — dia
 * trabalhado sem horário resolvível vai para `incompletos`.
 */
import { turnoDoDia, type DiaConfig, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { cargaLiquidaHoras } from "@/lib/dp/turno-utils";
import { formatarMinutos } from "./motor";

export interface ConfigVigenciaMin {
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

const CURTO = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/** Configuração vigente na data: início ≤ data e (sem fim ou fim ≥ data); a de início mais recente. */
export function configVigente<T extends ConfigVigenciaMin>(configs: T[], dataIso: string): T | null {
  const ok = configs.filter((c) => c.vigencia_inicio <= dataIso && (!c.vigencia_fim || c.vigencia_fim >= dataIso));
  ok.sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1));
  return ok[0] ?? null;
}

export interface JornadaCarregada {
  nome: string;
  minutos: number;
  /** Quantos dias dessa jornada existem na semana cadastrada. */
  qtd: number;
}

export interface ResultadoJornadas {
  jornadas: JornadaCarregada[];
  /** Dias trabalhados (dow) sem horário cadastrado resolvível. */
  incompletos: number[];
}

export function jornadasDaConfig(
  dias: DiaConfig[],
  turnoPadraoId: string | null,
  turnos: TurnoResolvido[],
): ResultadoJornadas {
  const grupos = new Map<number, number[]>();
  const incompletos: number[] = [];
  for (const d of [...dias].sort((a, b) => a.dow - b.dow)) {
    if (!d.trabalha) continue;
    const t = turnoDoDia(d, turnoPadraoId, turnos);
    const min = t ? Math.round(cargaLiquidaHoras(t) * 60) : 0;
    if (!t || min <= 0) { incompletos.push(d.dow); continue; }
    grupos.set(min, [...(grupos.get(min) ?? []), d.dow]);
  }
  const jornadas = [...grupos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([minutos, dows]) => ({
      nome: `${dows.map((x) => CURTO[x]).join(", ")} (${formatarMinutos(minutos).toUpperCase()})`,
      minutos,
      qtd: dows.length,
    }));
  return { jornadas, incompletos };
}

export const DOW_CURTO_CALC = CURTO;
