// ------------------------------------------------------------------
// Domínio: DP → Painel da operação (dia e mês)
//
// O painel não gera escala: ele lê o que já existe (jornada habitual,
// folgas marcadas, convocações, férias e atestados) e conta quantas
// pessoas cada dia tem em cada situação. Também aprende o padrão de
// pessoas por dia da semana para sinalizar dias fora da média.
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { cargaLiquidaHoras, turnoViraODia } from "@/lib/dp/turno-utils";
import { turnoDoDia, type ConfigTrabalho, type TurnoResolvido } from "@/lib/dp/config-trabalho";

export type CategoriaDia =
  | "fixo"
  | "convocado_aceito"
  | "convocado_pendente"
  | "folga_padrao"
  | "folga_extra"
  | "ferias"
  | "atestado";

export const CATEGORIA_LABEL: Record<CategoriaDia, string> = {
  fixo: "Fixos Escalados",
  convocado_aceito: "Convocados Aceitos",
  convocado_pendente: "Aguardando Resposta",
  folga_padrao: "Folga Padrão",
  folga_extra: "Folga Extra",
  ferias: "Férias",
  atestado: "Atestado/Licença",
};

export interface ColaboradorPanorama {
  id: string;
  nome: string;
  regime?: string | null;
  unidade_id?: string | null;
  /** Intermitente só entra na operação quando convocado. */
  intermitente: boolean;
  config: ConfigTrabalho | null;
  ativo?: boolean;
  data_admissao?: string | null;
  data_desligamento?: string | null;
}

export interface ConvocacaoPanorama {
  colaborador_id: string;
  data: string;
  /** Somente "aceita" e "pendente" contam; recusada/expirada/cancelada ficam fora. */
  status: "aceita" | "pendente";
  turno_id: string | null;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos?: number | null;
}

export interface FolgaPanorama {
  colaborador_id: string;
  data: string;
  /** tipo do registro em dp_folgas: normal | extra | ferias | abono | licenca */
  tipo: string;
  extra?: boolean | null;
}

export interface AusenciaPanorama {
  colaborador_id: string;
  inicio: string;
  fim: string;
  tipo: "ferias" | "atestado";
}

export interface ItemEscalaPanorama {
  colaborador_id: string;
  data: string;
  /** trabalho | folga | ferias | afastamento | feriado */
  tipo: string;
  turno_id: string | null;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos?: number | null;
}

export interface PessoaPanorama {
  colaborador_id: string;
  nome: string;
  categoria: CategoriaDia;
  turno_id: string | null;
  turno_nome: string | null;
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  /** Origem do horário: jornada habitual, escala publicada ou convocação. */
  origem: "jornada" | "escala" | "convocacao";
}

export type Contagens = Record<CategoriaDia, number>;

export interface ResultadoDia {
  data: string;
  dow: number;
  contagens: Contagens;
  /** Fixos escalados + convocados aceitos + convocados aguardando resposta. */
  trabalhando: number;
  pessoas: PessoaPanorama[];
}

const zeradas = (): Contagens => ({
  fixo: 0,
  convocado_aceito: 0,
  convocado_pendente: 0,
  folga_padrao: 0,
  folga_extra: 0,
  ferias: 0,
  atestado: 0,
});

export const parseData = (iso: string): Date => new Date(`${iso}T12:00:00`);
export const dowDaData = (iso: string): number => parseData(iso).getDay();

export function somarDias(iso: string, dias: number): string {
  const d = parseData(iso);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function diasDaCompetencia(competencia: string): string[] {
  const [ano, mes] = competencia.split("-").map(Number);
  if (!ano || !mes) return [];
  const total = new Date(ano, mes, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${competencia}-${String(i + 1).padStart(2, "0")}`);
}

const hora = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 5) : null);

const dentro = (a: AusenciaPanorama, data: string) => data >= a.inicio && data <= a.fim;

export interface ContarDiaInput {
  data: string;
  colaboradores: ColaboradorPanorama[];
  turnos: TurnoResolvido[];
  convocacoes: ConvocacaoPanorama[];
  folgas: FolgaPanorama[];
  ausencias: AusenciaPanorama[];
  /** Itens de escala publicada, quando existirem, têm prioridade sobre a jornada. */
  itensPublicados?: ItemEscalaPanorama[];
}

/**
 * Classifica cada colaborador no dia, sem dupla contagem.
 * Prioridade: férias > atestado > folga extra > folga padrão > trabalho.
 * A convocação aceita vence tudo (o colaborador confirmou presença).
 */
export function contarDia(input: ContarDiaInput): ResultadoDia {
  const { data, colaboradores, turnos } = input;
  const dow = dowDaData(data);
  const contagens = zeradas();
  const pessoas: PessoaPanorama[] = [];

  const convocPor = new Map<string, ConvocacaoPanorama>();
  for (const c of input.convocacoes) {
    if (c.data !== data) continue;
    const atual = convocPor.get(c.colaborador_id);
    // Aceita prevalece sobre pendente quando há mais de uma no mesmo dia.
    if (!atual || (atual.status === "pendente" && c.status === "aceita")) convocPor.set(c.colaborador_id, c);
  }

  const folgasPor = new Map<string, FolgaPanorama[]>();
  for (const f of input.folgas) {
    if (f.data !== data) continue;
    const lista = folgasPor.get(f.colaborador_id) ?? [];
    lista.push(f);
    folgasPor.set(f.colaborador_id, lista);
  }

  const itemPor = new Map<string, ItemEscalaPanorama>();
  for (const i of input.itensPublicados ?? []) {
    if (i.data === data) itemPor.set(i.colaborador_id, i);
  }

  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));

  const registrar = (
    colab: ColaboradorPanorama,
    categoria: CategoriaDia,
    horario?: {
      turno_id: string | null;
      turno_nome: string | null;
      entrada: string | null;
      saida: string | null;
      intervalo_minutos?: number | null;
      origem: PessoaPanorama["origem"];
    },
  ) => {
    contagens[categoria] += 1;
    const entrada = hora(horario?.entrada);
    const saida = hora(horario?.saida);
    pessoas.push({
      colaborador_id: colab.id,
      nome: colab.nome,
      categoria,
      turno_id: horario?.turno_id ?? null,
      turno_nome: horario?.turno_nome ?? null,
      entrada,
      saida,
      termina_no_dia_seguinte: !!entrada && !!saida && turnoViraODia(entrada, saida),
      carga_prevista_horas:
        entrada && saida
          ? cargaLiquidaHoras({ entrada, saida, intervalo_minutos: horario?.intervalo_minutos ?? 0 })
          : 0,
      origem: horario?.origem ?? "jornada",
    });
  };

  for (const colab of colaboradores) {
    const convocacao = convocPor.get(colab.id);
    if (convocacao) {
      const turno = convocacao.turno_id ? turnoPorId.get(convocacao.turno_id) ?? null : null;
      registrar(colab, convocacao.status === "aceita" ? "convocado_aceito" : "convocado_pendente", {
        turno_id: convocacao.turno_id,
        turno_nome: turno?.nome ?? "Convocação",
        entrada: convocacao.entrada,
        saida: convocacao.saida,
        intervalo_minutos: convocacao.intervalo_minutos ?? turno?.intervalo_minutos ?? 0,
        origem: "convocacao",
      });
      continue;
    }

    const ausencia = input.ausencias.find((a) => a.colaborador_id === colab.id && dentro(a, data));
    if (ausencia) {
      registrar(colab, ausencia.tipo);
      continue;
    }

    const folgas = folgasPor.get(colab.id) ?? [];
    const licenca = folgas.find((f) => f.tipo === "licenca");
    if (licenca) {
      registrar(colab, "atestado");
      continue;
    }
    if (folgas.some((f) => f.tipo === "ferias")) {
      registrar(colab, "ferias");
      continue;
    }
    const extra = folgas.find((f) => f.tipo === "extra" || f.extra === true);
    if (extra) {
      registrar(colab, "folga_extra");
      continue;
    }

    // Intermitente sem convocação e sem ausência simplesmente não está na operação.
    if (colab.intermitente) continue;

    const item = itemPor.get(colab.id);
    if (item) {
      if (item.tipo === "trabalho") {
        const turno = item.turno_id ? turnoPorId.get(item.turno_id) ?? null : null;
        registrar(colab, "fixo", {
          turno_id: item.turno_id,
          turno_nome: turno?.nome ?? "Escala publicada",
          entrada: item.entrada,
          saida: item.saida,
          intervalo_minutos: item.intervalo_minutos ?? turno?.intervalo_minutos ?? 0,
          origem: "escala",
        });
      } else if (item.tipo === "ferias") registrar(colab, "ferias");
      else if (item.tipo === "afastamento") registrar(colab, "atestado");
      else registrar(colab, "folga_padrao");
      continue;
    }

    if (folgas.some((f) => f.tipo === "normal" || f.tipo === "abono")) {
      registrar(colab, "folga_padrao");
      continue;
    }

    if (!colab.config) continue;
    const dia = colab.config.dias.find((d) => d.dow === dow);
    if (!dia || !dia.trabalha) {
      registrar(colab, "folga_padrao");
      continue;
    }
    const turno = turnoDoDia(dia, colab.config.turno_padrao_id, turnos);
    registrar(colab, "fixo", {
      turno_id: turno?.id ?? null,
      turno_nome: turno?.nome ?? "Sem turno definido",
      entrada: turno?.entrada ?? null,
      saida: turno?.saida ?? null,
      intervalo_minutos: turno?.intervalo_minutos ?? 0,
      origem: "jornada",
    });
  }

  const trabalhando = contagens.fixo + contagens.convocado_aceito + contagens.convocado_pendente;
  return { data, dow, contagens, trabalhando, pessoas };
}

// ------------------------------------------------------------------
// Padrão histórico por dia da semana
// ------------------------------------------------------------------

export const SEMANAS_BASELINE = 8;

function mediana(valores: number[]): number {
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : Math.round((ord[meio - 1] + ord[meio]) / 2);
}

/**
 * Mediana de pessoas trabalhando por dia da semana, a partir dos dias já
 * ocorridos. Dias sem ninguém na operação não entram (loja fechada/sem dado).
 */
export function baselinePorDow(
  historico: { data: string; trabalhando: number }[],
  opts?: { limite?: string; semanas?: number },
): Map<number, number> {
  const semanas = opts?.semanas ?? SEMANAS_BASELINE;
  const limite = opts?.limite;
  const inicio = limite ? somarDias(limite, -semanas * 7) : null;

  const porDow = new Map<number, number[]>();
  for (const h of historico) {
    if (limite && h.data >= limite) continue;
    if (inicio && h.data < inicio) continue;
    if (h.trabalhando <= 0) continue;
    const dow = dowDaData(h.data);
    const lista = porDow.get(dow) ?? [];
    lista.push(h.trabalhando);
    porDow.set(dow, lista);
  }

  const out = new Map<number, number>();
  for (const [dow, valores] of porDow) out.set(dow, mediana(valores));
  return out;
}

export type SituacaoDia = "ok" | "abaixo" | "acima" | "sem_padrao";

export interface AvaliacaoDia {
  situacao: SituacaoDia;
  padrao: number | null;
  diferenca: number;
}

export const TOLERANCIA_PADRAO = 0.2;

/** Compara o previsto do dia com o padrão daquele dia da semana. */
export function avaliarDia(
  previsto: number,
  padrao: number | null | undefined,
  tolerancia = TOLERANCIA_PADRAO,
): AvaliacaoDia {
  if (padrao == null || padrao <= 0) return { situacao: "sem_padrao", padrao: null, diferenca: 0 };
  const margem = Math.max(1, Math.round(padrao * tolerancia));
  const diferenca = previsto - padrao;
  if (diferenca < -margem) return { situacao: "abaixo", padrao, diferenca };
  if (diferenca > margem) return { situacao: "acima", padrao, diferenca };
  return { situacao: "ok", padrao, diferenca };
}

const DOW_PLURAL = ["domingos", "segundas", "terças", "quartas", "quintas", "sextas", "sábados"];

export function mensagemAlerta(dia: ResultadoDia, avaliacao: AvaliacaoDia, unidade?: string | null): string {
  const alvo = `${DOW_PLURAL[dia.dow]}${unidade ? ` na ${unidade}` : ""}`;
  const rotulo = avaliacao.situacao === "abaixo" ? "abaixo do padrão" : "acima do padrão";
  return `Previsto ${dia.trabalhando}, padrão ${avaliacao.padrao} para ${alvo} — ${rotulo}.`;
}
