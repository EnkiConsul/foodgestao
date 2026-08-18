// ------------------------------------------------------------------
// Domínio: dependentes e salário-família
//
// O salário-família é devido por filho/equiparado de até 14 anos
// incompletos (ou com deficiência, em qualquer idade) para quem recebe
// até o teto de baixa renda, que o INSS reajusta todo ano. Aqui ficam
// a elegibilidade, o cálculo da cota e os alertas de compliance.
// ------------------------------------------------------------------

export type Parentesco = "filho" | "enteado" | "tutelado" | "conjuge" | "outro";

export interface Dependente {
  id: string;
  colaborador_id: string;
  nome: string;
  data_nascimento: string | null;
  parentesco: Parentesco;
  cpf: string | null;
  deficiencia: boolean;
  laudo_validade: string | null;
  conta_irrf: boolean;
  conta_salario_familia: boolean;
  vacinacao_em: string | null;
  frequencia_escolar_em: string | null;
  cessado_em: string | null;
  observacao: string | null;
}

export interface SalarioFamiliaConfig {
  /** Valor da cota mensal por dependente. */
  cota: number | null;
  /** Teto de remuneração para ter direito ao benefício. */
  teto: number | null;
  /** Ano de vigência da tabela informada (ex.: 2026-01-01). */
  vigencia: string | null;
  /** Data em que o gestor confirmou os valores. */
  confirmadoEm: string | null;
}

export const PARENTESCO_LABEL: Record<Parentesco, string> = {
  filho: "Filho(a)",
  enteado: "Enteado(a)",
  tutelado: "Tutelado(a)",
  conjuge: "Cônjuge/companheiro(a)",
  outro: "Outro",
};

/** Idade limite (anos completos) para a cota do salário-família. */
export const IDADE_LIMITE_SALARIO_FAMILIA = 14;

const dia = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

const hojeIso = () => new Date().toISOString().slice(0, 10);

/** Idade em anos completos na data de referência. */
export function idadeEm(nascimento: string | null | undefined, referencia = hojeIso()): number | null {
  const nas = dia(nascimento);
  const ref = dia(referencia);
  if (!nas || !ref || ref < nas) return null;
  let anos = ref.getUTCFullYear() - nas.getUTCFullYear();
  const antes =
    ref.getUTCMonth() < nas.getUTCMonth() ||
    (ref.getUTCMonth() === nas.getUTCMonth() && ref.getUTCDate() < nas.getUTCDate());
  if (antes) anos -= 1;
  return Math.max(0, anos);
}

const PARENTESCO_ELEGIVEL: Parentesco[] = ["filho", "enteado", "tutelado"];

/** O dependente gera cota de salário-família na data de referência? */
export function dependenteElegivel(dep: Dependente, referencia = hojeIso()): boolean {
  if (dep.cessado_em && dep.cessado_em <= referencia) return false;
  if (!dep.conta_salario_familia) return false;
  if (!PARENTESCO_ELEGIVEL.includes(dep.parentesco)) return false;
  if (dep.deficiencia) return true;
  const idade = idadeEm(dep.data_nascimento, referencia);
  if (idade == null) return false;
  return idade < IDADE_LIMITE_SALARIO_FAMILIA;
}

export interface SalarioFamiliaCalculo {
  /** Dependentes que geram cota. */
  quantidade: number;
  /** Valor total do benefício no mês. */
  valor: number;
  /** Tem direito considerando o teto de baixa renda? */
  dentroDoTeto: boolean;
  /** Falta configurar a tabela do ano? */
  tabelaPendente: boolean;
  motivo: string;
}

/** Calcula a cota do mês para um colaborador. */
export function calcularSalarioFamilia(input: {
  dependentes: Dependente[];
  remuneracaoMensal: number;
  config: SalarioFamiliaConfig;
  referencia?: string;
}): SalarioFamiliaCalculo {
  const referencia = input.referencia ?? hojeIso();
  const elegiveis = input.dependentes.filter((d) => dependenteElegivel(d, referencia));
  const cota = input.config.cota ?? 0;
  const teto = input.config.teto ?? 0;
  const tabelaPendente = !input.config.cota || !input.config.teto || !input.config.vigencia;
  const dentroDoTeto = teto > 0 ? input.remuneracaoMensal <= teto : false;

  if (tabelaPendente) {
    return {
      quantidade: elegiveis.length,
      valor: 0,
      dentroDoTeto: false,
      tabelaPendente: true,
      motivo: "Atualize a cota e o teto do salário-família do ano vigente.",
    };
  }
  if (elegiveis.length === 0) {
    return {
      quantidade: 0,
      valor: 0,
      dentroDoTeto,
      tabelaPendente: false,
      motivo: "Nenhum dependente elegível.",
    };
  }
  if (!dentroDoTeto) {
    return {
      quantidade: elegiveis.length,
      valor: 0,
      dentroDoTeto: false,
      tabelaPendente: false,
      motivo: "Remuneração acima do teto de baixa renda.",
    };
  }
  return {
    quantidade: elegiveis.length,
    valor: Number((elegiveis.length * cota).toFixed(2)),
    dentroDoTeto: true,
    tabelaPendente: false,
    motivo: `${elegiveis.length} cota(s) de salário-família.`,
  };
}

export type AlertaDependenteTipo =
  | "vacinacao"
  | "frequencia_escolar"
  | "laudo"
  | "maioridade"
  | "sem_nascimento";

export interface AlertaDependente {
  dependenteId: string;
  nome: string;
  tipo: AlertaDependenteTipo;
  titulo: string;
  descricao: string;
  severidade: "alta" | "media";
}

const mesesEntre = (deIso: string, ateIso: string): number => {
  const de = dia(deIso);
  const ate = dia(ateIso);
  if (!de || !ate) return Number.POSITIVE_INFINITY;
  return (ate.getTime() - de.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
};

/**
 * Alertas de manutenção do benefício:
 * vacinação anual até 7 anos, frequência escolar semestral de 7 a 14 anos,
 * laudo de deficiência vencido e aviso de perda por maioridade.
 */
export function alertasDependentes(
  dependentes: Dependente[],
  referencia = hojeIso(),
): AlertaDependente[] {
  const out: AlertaDependente[] = [];
  for (const dep of dependentes) {
    if (dep.cessado_em && dep.cessado_em <= referencia) continue;
    if (!dep.conta_salario_familia) continue;
    if (!PARENTESCO_ELEGIVEL.includes(dep.parentesco)) continue;

    const idade = idadeEm(dep.data_nascimento, referencia);
    const base = { dependenteId: dep.id, nome: dep.nome };

    if (idade == null && !dep.deficiencia) {
      out.push({
        ...base,
        tipo: "sem_nascimento",
        titulo: "Data de nascimento não informada",
        descricao: "Sem a data de nascimento não é possível validar o direito à cota.",
        severidade: "alta",
      });
      continue;
    }

    if (dep.deficiencia && dep.laudo_validade && dep.laudo_validade < referencia) {
      out.push({
        ...base,
        tipo: "laudo",
        titulo: "Laudo de deficiência vencido",
        descricao: `Validade em ${dep.laudo_validade.slice(0, 10).split("-").reverse().join("/")}.`,
        severidade: "alta",
      });
    }

    if (idade != null && idade < 7) {
      const meses = dep.vacinacao_em ? mesesEntre(dep.vacinacao_em, referencia) : Infinity;
      if (meses > 12) {
        out.push({
          ...base,
          tipo: "vacinacao",
          titulo: "Comprovante de vacinação pendente",
          descricao: dep.vacinacao_em
            ? "A última comprovação tem mais de 12 meses."
            : "Registre a comprovação anual de vacinação.",
          severidade: "media",
        });
      }
    }

    if (idade != null && idade >= 7 && idade < IDADE_LIMITE_SALARIO_FAMILIA) {
      const meses = dep.frequencia_escolar_em
        ? mesesEntre(dep.frequencia_escolar_em, referencia)
        : Infinity;
      if (meses > 6) {
        out.push({
          ...base,
          tipo: "frequencia_escolar",
          titulo: "Frequência escolar pendente",
          descricao: dep.frequencia_escolar_em
            ? "A última comprovação tem mais de 6 meses."
            : "Registre a comprovação semestral de frequência escolar.",
          severidade: "media",
        });
      }
    }

    if (idade === IDADE_LIMITE_SALARIO_FAMILIA - 1 && !dep.deficiencia) {
      out.push({
        ...base,
        tipo: "maioridade",
        titulo: "Cota encerra em breve",
        descricao: "O dependente completa 14 anos no próximo ciclo e a cota deixa de ser devida.",
        severidade: "media",
      });
    }
  }
  return out;
}

/** A tabela do salário-família precisa de confirmação neste ano? */
export function tabelaSalarioFamiliaVencida(
  config: SalarioFamiliaConfig,
  referencia = hojeIso(),
): boolean {
  const anoRef = Number(referencia.slice(0, 4));
  if (!config.cota || !config.teto || !config.vigencia) return true;
  return Number(config.vigencia.slice(0, 4)) < anoRef;
}

export function descreverTabelaSalarioFamilia(config: SalarioFamiliaConfig): string {
  if (!config.cota || !config.teto || !config.vigencia) {
    return "Tabela do salário-família não configurada";
  }
  return `Vigência ${config.vigencia.slice(0, 4)} — cota por dependente e teto de baixa renda cadastrados`;
}
