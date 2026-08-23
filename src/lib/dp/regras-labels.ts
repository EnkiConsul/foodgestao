/**
 * Rótulos e formatação legível dos campos de regras de folgas (`dp_config_dp`),
 * usados no histórico de alterações para mostrar exatamente o que mudou.
 */
import { DIA_SEMANA_CURTO, MODO_FREQUENCIA_LABEL } from "@/lib/dp/dsr-rules";

export const REGRAS_CAMPO_LABEL: Record<string, string> = {
  setor_comercio: "Setor comércio",
  modo_frequencia_domingo: "Modo de frequência de domingo",
  periodicidade_domingo: "Domingo de folga a cada (semanas)",
  domingos_por_mes: "Domingos de folga por mês",
  modo_frequencia_domingo_mulher: "Modo de frequência de domingo (mulheres)",
  periodicidade_domingo_mulher: "Domingo de folga a cada (semanas, mulheres)",
  domingos_por_mes_mulher: "Domingos de folga por mês (mulheres)",
  regra_dsr: "Regra de DSR",
  exige_validacao_menor: "Exige validação para menores de idade",
  tipo_descanso_domingo: "Origem do descanso semanal",
  dias_descanso_negociados: "Dias de descanso negociados",
  negociacao_id: "Negociação coletiva vinculada",
  folgas_fds_por_mes: "Folgas em fim de semana por mês",
  // Campos de outras regras registradas no mesmo histórico (jornada do colaborador)
  dias: "Dias da semana configurados",
  horario: "Horário de trabalho",
  alertas: "Alertas legais",
  turno_id: "Turno",
  jornada_id: "Jornada",
  carga_semanal: "Carga semanal",
  colaborador_id: "Colaborador",
  regime: "Regime de contratação",
};

const REGRA_DSR_LABEL: Record<string, string> = {
  clt: "CLT (padrão legal)",
  acordo: "Acordo coletivo",
  convencao: "Convenção coletiva",
};

const TIPO_DESCANSO_LABEL: Record<string, string> = {
  legal: "Legal (CLT)",
  acordo_coletivo: "Acordo coletivo",
};

/** Converte um valor de campo em texto legível em pt-BR. */
export function formatRegraValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";

  if (campo === "dias_descanso_negociados" && Array.isArray(valor)) {
    if (valor.length === 0) return "—";
    return valor
      .map((d) => DIA_SEMANA_CURTO[Number(d)] ?? String(d))
      .join(", ");
  }
  if (Array.isArray(valor)) {
    if (valor.length === 0) return "—";
    const todosSimples = valor.every((v) => typeof v !== "object" || v === null);
    if (todosSimples) return valor.join(", ");
    return `${valor.length} registro(s)`;
  }
  if (typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .slice(0, 4)
      .map(([k, v]) => {
        const rotulo = REGRAS_CAMPO_LABEL[k] ?? k.replace(/_/g, " ");
        return `${rotulo}: ${typeof v === "object" ? "…" : String(v)}`;
      });
    return entradas.length ? entradas.join(" · ") : "—";
  }

  const texto = String(valor);
  if (campo === "regra_dsr") return REGRA_DSR_LABEL[texto] ?? texto;
  if (campo === "tipo_descanso_domingo") return TIPO_DESCANSO_LABEL[texto] ?? texto;
  if (campo.startsWith("modo_frequencia")) {
    return (MODO_FREQUENCIA_LABEL as Record<string, string>)[texto] ?? texto;
  }
  if (campo === "negociacao_id") return "Negociação vinculada";
  if (typeof valor === "number") {
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace(".", ",");
  }
  return texto;
}

export interface RegraDiffItem {
  campo: string;
  label: string;
  de: string;
  para: string;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Compara o valor antigo e o novo de um registro do histórico e devolve
 * apenas os campos que realmente mudaram, já formatados.
 */
export function diffRegras(antigo: unknown, novo: unknown): RegraDiffItem[] {
  const a = (antigo && typeof antigo === "object" ? antigo : {}) as Record<string, unknown>;
  const b = (novo && typeof novo === "object" ? novo : {}) as Record<string, unknown>;
  const campos = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));

  return campos
    .filter((campo) => !["id", "company_id", "unidade_id"].includes(campo))
    .filter((campo) => !igual(a[campo], b[campo]))
    .map((campo) => ({
      campo,
      label: REGRAS_CAMPO_LABEL[campo] ?? campo.replace(/_/g, " "),
      de: formatRegraValor(campo, a[campo]),
      para: formatRegraValor(campo, b[campo]),
    }));
}
