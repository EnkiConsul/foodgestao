// ------------------------------------------------------------------
// Domínio: DP → Painel da operação (dia e mês)
//
// O painel não gera escala: ele lê o que já existe (jornada habitual,
// folgas marcadas, convocações, férias e atestados) e conta quantas
// pessoas cada dia tem em cada situação. Também aprende o padrão de
// pessoas por dia da semana para sinalizar dias fora da média.
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import {
  cargaLiquidaHoras,
  turnoViraODia,
  periodosDoDia,
  periodoCompleto,
  formatarPeriodo,
  type HorarioFuncionamentoDia,
  type HorarioFuncionamentoPeriodo,
} from "@/lib/dp/turno-utils";
import { paraMinutos } from "@/lib/dp/jornada-utils";
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
  cargo_id?: string | null;
  cargo_nome?: string | null;
  /** Sócio: aparece na operação mas sem regras CLT. */
  socio?: boolean;
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
  unidade_id: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  socio: boolean;
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
      unidade_id: colab.unidade_id ?? null,
      cargo_id: colab.cargo_id ?? null,
      cargo_nome: colab.cargo_nome ?? null,
      socio: !!colab.socio,
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

// ------------------------------------------------------------------
// Blocos por período de funcionamento da unidade, agrupados por cargo
// ------------------------------------------------------------------

export interface GrupoCargo {
  cargo_id: string | null;
  cargo_nome: string;
  pessoas: PessoaPanorama[];
}

export interface BlocoFuncionamento {
  key: string;
  /** Nome do período (ex.: "Jantar") ou rótulo do bloco especial. */
  titulo: string;
  horario: string | null;
  unidade_id: string | null;
  unidade_nome: string | null;
  fechado: boolean;
  pessoas: PessoaPanorama[];
  grupos: GrupoCargo[];
}

const SEM_CARGO = "Sem cargo definido";

function agruparPorCargo(pessoas: PessoaPanorama[]): GrupoCargo[] {
  const mapa = new Map<string, GrupoCargo>();
  for (const p of pessoas) {
    const chave = p.cargo_id ?? "sem-cargo";
    const atual = mapa.get(chave) ?? {
      cargo_id: p.cargo_id ?? null,
      cargo_nome: p.cargo_nome ?? SEM_CARGO,
      pessoas: [],
    };
    atual.pessoas.push(p);
    mapa.set(chave, atual);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, pessoas: [...g.pessoas].sort((a, b) => a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => a.cargo_nome.localeCompare(b.cargo_nome));
}

/** Minutos do período, esticando o fechamento quando ele vira o dia. */
function janelaPeriodo(p: HorarioFuncionamentoPeriodo): { abre: number; fecha: number } | null {
  const abre = paraMinutos(p.hora_abertura ?? "");
  const fecha0 = paraMinutos(p.hora_fechamento ?? "");
  if (abre === null || fecha0 === null) return null;
  return { abre, fecha: fecha0 <= abre ? fecha0 + 24 * 60 : fecha0 };
}

/** Sobreposição entre a jornada da pessoa e a janela do período. */
function encaixa(p: PessoaPanorama, janela: { abre: number; fecha: number }): boolean {
  const entrada = paraMinutos(p.entrada ?? "");
  if (entrada === null) return false;
  const saida0 = paraMinutos(p.saida ?? "");
  const saida = saida0 === null ? entrada : saida0 <= entrada ? saida0 + 24 * 60 : saida0;
  return entrada < janela.fecha && saida > janela.abre;
}

/**
 * Monta os blocos do dia a partir do funcionamento da loja (não do turno
 * cadastrado do colaborador). Cada pessoa entra no período em que a jornada
 * dela se sobrepõe; quem não encaixa em nenhum vai para um bloco à parte.
 */
export function blocosPorFuncionamento(input: {
  data: string;
  pessoas: PessoaPanorama[];
  /** Funcionamento por unidade: unidade_id → dias. */
  funcionamentoPorUnidade: Map<string, HorarioFuncionamentoDia[]>;
  unidades: { id: string; nome: string }[];
  /** Quando null, agrupa por unidade. */
  unidadeId: string | null;
}): BlocoFuncionamento[] {
  const dow = dowDaData(input.data);
  const nomeUnidade = new Map(input.unidades.map((u) => [u.id, u.nome]));
  const alvos = input.unidadeId
    ? [input.unidadeId]
    : [...new Set(input.pessoas.map((p) => p.unidade_id).filter((x): x is string => !!x))];

  const out: BlocoFuncionamento[] = [];
  const semUnidade = input.pessoas.filter((p) => !p.unidade_id);

  for (const uid of alvos) {
    const daUnidade = input.pessoas.filter((p) => p.unidade_id === uid || (input.unidadeId && !p.unidade_id));
    const dias = input.funcionamentoPorUnidade.get(uid) ?? [];
    const dia = dias.find((d) => d.dia_semana === dow);
    const periodos = dia && dia.aberto ? periodosDoDia(dia).filter(periodoCompleto) : [];
    const alocadas = new Set<string>();

    periodos.forEach((per, i) => {
      const janela = janelaPeriodo(per);
      const pessoas = janela ? daUnidade.filter((p) => encaixa(p, janela)) : [];
      pessoas.forEach((p) => alocadas.add(p.colaborador_id));
      out.push({
        key: `${uid}-${i}`,
        titulo: per.nome?.trim() || `Período ${i + 1}`,
        horario: formatarPeriodo(per),
        unidade_id: uid,
        unidade_nome: nomeUnidade.get(uid) ?? null,
        fechado: false,
        pessoas,
        grupos: agruparPorCargo(pessoas),
      });
    });

    const restantes = daUnidade.filter((p) => !alocadas.has(p.colaborador_id));
    if (restantes.length || (!periodos.length && daUnidade.length)) {
      const fechado = !periodos.length;
      out.push({
        key: `${uid}-fora`,
        titulo: fechado
          ? dia && dia.aberto
            ? "Sem Horário de Funcionamento Cadastrado"
            : "Unidade Fechada Neste Dia"
          : "Fora do Horário de Funcionamento",
        horario: null,
        unidade_id: uid,
        unidade_nome: nomeUnidade.get(uid) ?? null,
        fechado,
        pessoas: restantes,
        grupos: agruparPorCargo(restantes),
      });
    }
  }

  if (!input.unidadeId && semUnidade.length) {
    out.push({
      key: "sem-unidade",
      titulo: "Sem Unidade Definida",
      horario: null,
      unidade_id: null,
      unidade_nome: null,
      fechado: false,
      pessoas: semUnidade,
      grupos: agruparPorCargo(semUnidade),
    });
  }

  return out;
}
