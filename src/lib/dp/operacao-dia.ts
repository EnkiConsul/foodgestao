// ------------------------------------------------------------------
// Domínio: DP → Operação do dia (Fase 4)
//
// A operação do dia lê a escala já gerada/publicada e organiza o dia
// por turno: quem entra, quem sai, quem está ausente e onde falta gente.
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { paraMinutos } from "@/lib/dp/jornada-utils";
import type { EscalaItem, EscalaItemTipo } from "@/lib/dp/escala-mes";

export interface PessoaDia {
  colaborador_id: string;
  nome: string;
  cargo?: string | null;
  tipo: EscalaItemTipo;
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  turno_id: string | null;
  ajustado: boolean;
  observacao?: string | null;
}

export interface BlocoTurno {
  turno_id: string | null;
  nome: string;
  cor?: string | null;
  entrada: string | null;
  saida: string | null;
  pessoas: PessoaDia[];
  minimo?: number;
  descoberto: number;
}

export interface ColaboradorDia {
  id: string;
  nome: string;
  cargo?: string | null;
}

export interface TurnoDia {
  id: string;
  nome: string;
  cor?: string | null;
  entrada: string;
  saida: string;
}

export interface MontarDiaInput {
  data: string;
  itens: EscalaItem[];
  colaboradores: ColaboradorDia[];
  turnos: TurnoDia[];
  /** Mínimo de pessoas por turno (chave = turno_id). */
  coberturaMinima?: Record<string, number>;
}

export interface ResumoDia {
  escalados: number;
  ausentes: number;
  cargaPrevista: number;
  ajustes: number;
  descobertoTotal: number;
}

export interface OperacaoDia {
  data: string;
  blocos: BlocoTurno[];
  ausentes: PessoaDia[];
  semEscala: ColaboradorDia[];
  resumo: ResumoDia;
}

const AUSENCIA_LABEL: Record<string, string> = {
  folga: "Folga",
  ferias: "Férias",
  afastamento: "Afastamento",
  feriado: "Feriado",
};

export function rotuloAusencia(tipo: EscalaItemTipo): string {
  return AUSENCIA_LABEL[tipo] ?? "Ausente";
}

const ordenaHora = (a: string | null, b: string | null) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  const minA = paraMinutos(a);
  const minB = paraMinutos(b);
  if (minA === null && minB === null) return 0;
  if (minA === null) return 1;
  if (minB === null) return -1;
  return minA - minB;
};

/** Organiza a escala de um dia em blocos por turno + ausentes + pendências. */
export function montarOperacaoDia(input: MontarDiaInput): OperacaoDia {
  const { data } = input;
  const nomes = new Map(input.colaboradores.map((c) => [c.id, c]));
  const doDia = input.itens.filter((i) => i.data === data);

  const pessoas: PessoaDia[] = doDia.map((i) => {
    const c = nomes.get(i.colaborador_id);
    return {
      colaborador_id: i.colaborador_id,
      nome: c?.nome ?? "Colaborador",
      cargo: c?.cargo ?? null,
      tipo: i.tipo,
      entrada: i.entrada,
      saida: i.saida,
      termina_no_dia_seguinte: i.termina_no_dia_seguinte,
      carga_prevista_horas: i.carga_prevista_horas,
      turno_id: i.turno_id,
      ajustado: i.origem !== "gerado",
      observacao: i.observacao ?? null,
    };
  });

  const trabalhando = pessoas.filter((p) => p.tipo === "trabalho");
  const ausentes = pessoas
    .filter((p) => p.tipo !== "trabalho")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const blocosMap = new Map<string, BlocoTurno>();
  const chave = (id: string | null) => id ?? "__sem_turno__";

  for (const turno of input.turnos) {
    const minimo = input.coberturaMinima?.[turno.id];
    if (minimo == null && !trabalhando.some((p) => p.turno_id === turno.id)) continue;
    blocosMap.set(chave(turno.id), {
      turno_id: turno.id,
      nome: turno.nome,
      cor: turno.cor ?? null,
      entrada: turno.entrada,
      saida: turno.saida,
      pessoas: [],
      minimo,
      descoberto: 0,
    });
  }

  for (const p of trabalhando) {
    const k = chave(p.turno_id);
    let bloco = blocosMap.get(k);
    if (!bloco) {
      bloco = {
        turno_id: p.turno_id,
        nome: p.turno_id ? "Turno removido" : "Sem turno definido",
        cor: null,
        entrada: p.entrada,
        saida: p.saida,
        pessoas: [],
        descoberto: 0,
      };
      blocosMap.set(k, bloco);
    }
    bloco.pessoas.push(p);
  }

  const blocos = [...blocosMap.values()]
    .map((b) => ({
      ...b,
      pessoas: b.pessoas.sort(
        (x, y) => ordenaHora(x.entrada, y.entrada) || x.nome.localeCompare(y.nome, "pt-BR"),
      ),
      descoberto: b.minimo != null ? Math.max(0, b.minimo - b.pessoas.length) : 0,
    }))
    .sort((a, b) => ordenaHora(a.entrada, b.entrada) || a.nome.localeCompare(b.nome, "pt-BR"));

  const comItem = new Set(doDia.map((i) => i.colaborador_id));
  const semEscala = input.colaboradores
    .filter((c) => !comItem.has(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const resumo: ResumoDia = {
    escalados: trabalhando.length,
    ausentes: ausentes.length,
    cargaPrevista:
      Math.round(trabalhando.reduce((s, p) => s + (p.carga_prevista_horas ?? 0), 0) * 100) / 100,
    ajustes: pessoas.filter((p) => p.ajustado).length,
    descobertoTotal: blocos.reduce((s, b) => s + b.descoberto, 0),
  };

  return { data, blocos, ausentes, semEscala, resumo };
}

export interface AlertaDia {
  nivel: "erro" | "aviso";
  mensagem: string;
}

/** Pontos de atenção do dia: descoberto, pessoas sem turno e sem escala. */
export function alertasDoDia(dia: OperacaoDia): AlertaDia[] {
  const alertas: AlertaDia[] = [];

  for (const bloco of dia.blocos) {
    if (bloco.descoberto > 0) {
      alertas.push({
        nivel: "erro",
        mensagem: `${bloco.nome}: faltam ${bloco.descoberto} de ${bloco.minimo} pessoas.`,
      });
    }
    if (bloco.turno_id === null && bloco.pessoas.length) {
      alertas.push({
        nivel: "erro",
        mensagem: `${bloco.pessoas.length} pessoa(s) escaladas sem turno definido.`,
      });
    }
  }

  if (dia.semEscala.length) {
    alertas.push({
      nivel: "aviso",
      mensagem: `${dia.semEscala.length} colaborador(es) sem nenhum registro na escala do dia.`,
    });
  }

  if (dia.resumo.escalados === 0) {
    alertas.push({ nivel: "aviso", mensagem: "Nenhuma pessoa escalada para trabalhar neste dia." });
  }

  return alertas;
}
