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
import type { OcorrenciaEstado, OcorrenciaTipo } from "@/lib/dp/ocorrencias";

export type CategoriaDia =
  | "fixo"
  | "convocado_aceito"
  | "convocado_pendente"
  | "coberto"
  | "folga_padrao"
  | "folga_extra"
  | "ferias"
  | "atestado"
  | "ausente"
  | "atrasado"
  | "saida_antecipada";


export const CATEGORIA_LABEL: Record<CategoriaDia, string> = {
  fixo: "Fixos Escalados",
  convocado_aceito: "Convocados Aceitos",
  convocado_pendente: "Aguardando Resposta",
  coberto: "Coberto por Folguista",
  folga_padrao: "Folga Padrão",
  folga_extra: "Folga Extra",
  ferias: "Férias",
  atestado: "Atestado / Licença",
  ausente: "Ausências",
  atrasado: "Atrasos",
  saida_antecipada: "Saídas Antecipadas",
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
  /** Setor habitual do cadastro (opcional — só existe quando a unidade usa setores). */
  setor_id?: string | null;
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

export interface OcorrenciaPanorama {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: OcorrenciaTipo;
  estado: OcorrenciaEstado;
  minutos: number | null;
  horario_estimado: string | null;
  horario_real: string | null;
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
  /** Setor definido só para esta data (exceção da escala publicada). */
  setor_id?: string | null;
}

export type PessoaAvulsaTipo = "teste" | "folguista" | "registro_manual";

/**
 * Pessoa registrada só para a rotina do dia. Pode ser alguém que não é
 * colaborador cadastrado (em teste na loja ou folguista cobrindo alguém) ou o
 * registro manual de um colaborador cadastrado que trabalhou sem convocação /
 * escala. Em nenhum caso gera folga, ponto, folha ou convocação.
 */
export interface PessoaAvulsaPanorama {
  id: string;
  /** Nome livre; nulo quando o registro aponta para um colaborador cadastrado. */
  nome: string | null;
  tipo: PessoaAvulsaTipo;
  /** Preenchido só no registro manual de colaborador cadastrado. */
  colaborador_id?: string | null;
  unidade_id: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  /** Colaborador coberto pelo folguista, quando houver. */
  cobre_colaborador_id?: string | null;
  cobre_nome: string | null;
  /** Motivo operacional da cobertura (folga, falta, atestado, outro). */
  cobre_motivo?: string | null;
  data_inicio: string;
  data_fim: string;
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean;
  observacao: string | null;
  /** Setor em que a pessoa atua no dia (guardado no próprio registro). */
  setor_id?: string | null;
  /** Setor habitual do cadastro de apoio (folguista/teste), usado como padrão. */
  setor_habitual_id?: string | null;
  /** Telefone de contato (folguista/teste). */
  telefone?: string | null;
  /** Cadastro reaproveitável de apoio que originou o registro. */
  pessoa_apoio_id?: string | null;
}



/** Id sintético usado nas listas do painel (nunca é um colaborador real). */
export const idPessoaAvulsa = (id: string) => `avulso:${id}`;


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
  /** Setor efetivo da data (escala do dia → dia da semana → cadastro). */
  setor_id?: string | null;
  setor_nome?: string | null;
  /** De onde veio o setor efetivo. */
  setor_origem?: OrigemSetorDia;
  /** Setor habitual do cadastro, para comparar com o setor da data. */
  setor_habitual_id?: string | null;
  setor_habitual_nome?: string | null;
  socio: boolean;
  /** Sócio vinculado a uma unidade e com jornada: conta como parte do quadro. */
  socio_integrado?: boolean;
  /** Origem do horário: jornada habitual, escala, convocação, avulso ou registro manual. */
  origem: "jornada" | "escala" | "convocacao" | "avulso" | "registro_manual";

  /** Ocorrências do dia vinculadas a esta pessoa (para badge e cards). */
  ocorrencias?: OcorrenciaPanorama[];

  /** Preenchido só para entradas extras criadas a partir de uma ocorrência. */
  ocorrencia_id?: string;

  /** Preenchido só para pessoas avulsas (teste/folguista). */
  avulso_id?: string;
  avulso_tipo?: PessoaAvulsaTipo;
  /** Nome do colaborador coberto, quando folguista. */
  cobre_nome?: string | null;
  /** Motivo operacional da cobertura (folga, falta, atestado, outro). */
  cobre_motivo?: string | null;
  /** Nome do folguista que substitui este colaborador no dia. */
  coberto_por_nome?: string | null;
  observacao?: string | null;
}

export type Contagens = Record<CategoriaDia, number>;

export interface ContagensAvulsos {
  teste: number;
  folguista: number;
}

export interface ResultadoDia {
  data: string;
  dow: number;
  contagens: Contagens;
  /** Contagem de pessoas avulsas por tipo no dia. */
  contagens_avulsos: ContagensAvulsos;
  /** Confirmados: fixos escalados + convocações aceitas. Pendentes não entram. */
  trabalhando: number;
  /** Convocações aguardando resposta (nunca somadas em `trabalhando`). */
  aguardando: number;
  pessoas: PessoaPanorama[];
}

const zeradas = (): Contagens => ({
  fixo: 0,
  convocado_aceito: 0,
  convocado_pendente: 0,
  coberto: 0,
  folga_padrao: 0,
  folga_extra: 0,
  ferias: 0,
  atestado: 0,
  ausente: 0,
  atrasado: 0,
  saida_antecipada: 0,
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

/** Origem do setor efetivo de uma data. */
export type OrigemSetorDia = "escala" | "config_dia" | "cadastro" | "nenhum";

/**
 * Setor efetivo de um colaborador numa data. Espelha `public.dp_setor_previsto`:
 * exceção da escala publicada → setor do dia da semana → setor habitual.
 */
export function setorEfetivoDoDia(input: {
  colaborador: ColaboradorPanorama;
  item?: ItemEscalaPanorama | null;
  dow: number;
}): { setor_id: string | null; origem: OrigemSetorDia } {
  if (input.item?.setor_id) return { setor_id: input.item.setor_id, origem: "escala" };
  const dia = input.colaborador.config?.dias.find((d) => d.dow === input.dow);
  if (dia?.setor_id) return { setor_id: dia.setor_id, origem: "config_dia" };
  if (input.colaborador.setor_id) return { setor_id: input.colaborador.setor_id, origem: "cadastro" };
  return { setor_id: null, origem: "nenhum" };
}

export interface ContarDiaInput {
  data: string;
  colaboradores: ColaboradorPanorama[];
  turnos: TurnoResolvido[];
  convocacoes: ConvocacaoPanorama[];
  folgas: FolgaPanorama[];
  ausencias: AusenciaPanorama[];
  /** Itens de escala publicada, quando existirem, têm prioridade sobre a jornada. */
  itensPublicados?: ItemEscalaPanorama[];
  /** Pessoas avulsas (teste/folguista) registradas para a rotina do dia. */
  avulsos?: PessoaAvulsaPanorama[];
  /** Ocorrências operacionais do dia (falta, atraso, saída antecipada). */
  ocorrencias?: OcorrenciaPanorama[];
  /** Setores da unidade, só para nomear o setor efetivo. */
  setores?: { id: string; nome: string }[];
}

/**
 * Classifica cada colaborador no dia, sem dupla contagem.
 * Prioridade: férias > convocação aceita/pendente > atestado > folga extra >
 * folga padrão > trabalho. Férias aprovadas vencem a convocação: quem está de
 * férias não é escalado nem convocado.
 */
const OCORRENCIA_CATEGORIA: Partial<Record<OcorrenciaTipo, CategoriaDia>> = {
  falta: "ausente",
  previsao_falta: "ausente",
  atraso: "atrasado",
  previsao_atraso: "atrasado",
  saida_antecipada: "saida_antecipada",
  previsao_saida_antecipada: "saida_antecipada",
  // Atestado/ausência justificada registrados como ocorrência operacional
  // (ex.: motivo de uma cobertura) também tiram a pessoa do quadro do dia.
  atestado: "atestado",
  ausencia_justificada: "atestado",
};

/** Categorias que já representam a pessoa fora do trabalho no dia. */
const CATS_AUSENCIA: CategoriaDia[] = ["ausente", "atestado", "ferias", "folga_padrao", "folga_extra"];
/** Categorias de ocorrência que substituem a categoria de trabalho (não duplicam). */
const CATS_OCORRENCIA_AUSENCIA: CategoriaDia[] = ["ausente", "atestado"];

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

  // Registro manual: o gestor confirma que um colaborador cadastrado trabalhou
  // no dia (convocação esquecida, cobertura de última hora etc.).
  const manualPor = new Map<string, PessoaAvulsaPanorama>();
  for (const a of input.avulsos ?? []) {
    if (a.tipo !== "registro_manual" || !a.colaborador_id) continue;
    if (data < a.data_inicio || data > a.data_fim) continue;
    manualPor.set(a.colaborador_id, a);
  }

  // A própria cobertura é suficiente para retirar o colaborador coberto do
  // quadro de trabalho. Ocorrências e folgas continuam prevalecendo quando
  // existirem; este mapa cobre também registros antigos sem motivo salvo.
  const coberturaPor = new Map<string, PessoaAvulsaPanorama>();
  for (const a of input.avulsos ?? []) {
    if (a.tipo !== "folguista" || !a.cobre_colaborador_id) continue;
    if (data < a.data_inicio || data > a.data_fim) continue;
    coberturaPor.set(a.cobre_colaborador_id, a);
  }

  // Ocorrências do dia (falta, atraso, saída antecipada) agrupadas por colaborador.
  const ocorrenciasPor = new Map<string, OcorrenciaPanorama[]>();
  for (const o of input.ocorrencias ?? []) {
    if (o.data !== data) continue;
    const lista = ocorrenciasPor.get(o.colaborador_id) ?? [];
    lista.push(o);
    ocorrenciasPor.set(o.colaborador_id, lista);
  }

  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  const nomeSetor = new Map((input.setores ?? []).map((st) => [st.id, st.nome]));


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
    extras?: {
      avulso_id?: string;
      avulso_tipo?: PessoaAvulsaTipo;
      observacao?: string | null;
      coberto_por_nome?: string | null;
      cobre_motivo?: string | null;
    },
  ) => {
    // Sócio com unidade definida e jornada cadastrada faz parte do quadro daquela
    // unidade: entra nas contagens normais (fixo e folga padrão da jornada).
    // Sócio em "Geral" ou sem jornada fica fora das contagens CLT e aparece
    // apenas no card "Folga Sócio" quando marca folga ou férias. Folga extra e
    // férias de qualquer sócio seguem contando somente em "Folga Sócio".
    const socioIntegrado = !!colab.socio && !!colab.unidade_id && !!colab.config;
    const ausenciaDeSocio =
      !!colab.socio &&
      (categoria === "folga_padrao" || categoria === "folga_extra" || categoria === "ferias") &&
      !(socioIntegrado && categoria === "folga_padrao");
    if (!ausenciaDeSocio) contagens[categoria] += 1;

    const entrada = hora(horario?.entrada);
    const saida = hora(horario?.saida);
    const setor = setorEfetivoDoDia({ colaborador: colab, item: itemPor.get(colab.id) ?? null, dow });
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
      setor_id: setor.setor_id,
      setor_nome: setor.setor_id ? nomeSetor.get(setor.setor_id) ?? null : null,
      setor_origem: setor.origem,
      setor_habitual_id: colab.setor_id ?? null,
      setor_habitual_nome: colab.setor_id ? nomeSetor.get(colab.setor_id) ?? null : null,
      socio: !!colab.socio,
      socio_integrado: socioIntegrado,
      origem: horario?.origem ?? "jornada",
      ...(extras ?? {}),
    });
  };


  for (const colab of colaboradores) {
    const ausencia = input.ausencias.find((a) => a.colaborador_id === colab.id && dentro(a, data));

    // Férias aprovadas vencem qualquer outra fonte: quem está de férias não é
    // escalado nem convocado, mesmo que exista convocação registrada no dia.
    if (ausencia?.tipo === "ferias") {
      registrar(colab, "ferias");
      continue;
    }

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

    // Registro manual de trabalho: vale mais que jornada/escala do dia, mas
    // nunca duplica convocação, férias, atestado ou folga extra (tratados acima).
    const manual = manualPor.get(colab.id);
    if (manual) {
      registrar(
        colab,
        colab.intermitente ? "convocado_aceito" : "fixo",
        {
          turno_id: null,
          turno_nome: "Registro manual",
          entrada: manual.entrada,
          saida: manual.saida,
          intervalo_minutos: 0,
          origem: "registro_manual",
        },
        { avulso_id: manual.id, avulso_tipo: "registro_manual", observacao: manual.observacao },
      );
      continue;
    }

    // Intermitente sem convocação e sem ausência simplesmente não está na operação.
    if (colab.intermitente) continue;

    const cobertura = coberturaPor.get(colab.id);
    if (cobertura) {
      registrar(colab, "coberto", undefined, {
        coberto_por_nome: cobertura.nome ?? "Folguista",
        cobre_motivo: cobertura.cobre_motivo ?? null,
      });
      continue;
    }

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

  // Pessoas avulsas (teste/folguista) contam como quadro do dia, igual a um
  // colaborador escalado: entram em "fixo" e, portanto, em "trabalhando".
  // O registro manual já foi tratado junto do colaborador cadastrado.
  for (const a of input.avulsos ?? []) {
    if (a.tipo === "registro_manual") continue;
    if (data < a.data_inicio || data > a.data_fim) continue;
    const entrada = hora(a.entrada);
    const saida = hora(a.saida);
    contagens.fixo += 1;
    pessoas.push({
      colaborador_id: idPessoaAvulsa(a.id),
      nome: a.nome ?? "Sem nome",
      categoria: "fixo",

      turno_id: null,
      turno_nome: a.tipo === "teste" ? "Em teste" : "Folguista",
      entrada,
      saida,
      termina_no_dia_seguinte:
        a.termina_no_dia_seguinte || (!!entrada && !!saida && turnoViraODia(entrada, saida)),
      carga_prevista_horas:
        entrada && saida ? cargaLiquidaHoras({ entrada, saida, intervalo_minutos: 0 }) : 0,
      unidade_id: a.unidade_id,
      cargo_id: a.cargo_id,
      cargo_nome: a.cargo_nome,
      setor_id: a.setor_id ?? a.setor_habitual_id ?? null,
      setor_nome: (() => {
        const id = a.setor_id ?? a.setor_habitual_id ?? null;
        return id ? nomeSetor.get(id) ?? null : null;
      })(),
      setor_origem: a.setor_id ? "escala" : a.setor_habitual_id ? "cadastro" : "nenhum",
      setor_habitual_id: a.setor_habitual_id ?? null,
      setor_habitual_nome: a.setor_habitual_id
        ? nomeSetor.get(a.setor_habitual_id) ?? null
        : null,
      socio: false,
      origem: "avulso",
      avulso_id: a.id,
      avulso_tipo: a.tipo,
      cobre_nome: a.cobre_nome,
      cobre_motivo: a.cobre_motivo ?? null,
      observacao: a.observacao,
    });
  }

  // Aplica ocorrências do dia aos colaboradores já classificados. Ausente
  // vence a categoria de trabalho: quem faltou não conta como trabalhando.
  // Atraso e saída antecipada geram uma pessoa adicional nos cards
  // correspondentes, sem afetar o total de trabalhando.
  const colabPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const pessoaPrincipalPorColab = new Map<string, PessoaPanorama>();
  for (const p of pessoas) {
    if (!p.avulso_id && !p.colaborador_id.startsWith("avulso:")) {
      pessoaPrincipalPorColab.set(p.colaborador_id, p);
    }
  }

  for (const [colabId, ocorrencias] of ocorrenciasPor.entries()) {
    const principal = pessoaPrincipalPorColab.get(colabId);
    const colab = colabPorId.get(colabId);
    const categoriasTrabalho: CategoriaDia[] = ["fixo", "convocado_aceito", "convocado_pendente"];
    // Falta e atestado/ausência justificada vencem a categoria de trabalho:
    // quem faltou ou está afastado não conta como trabalhando.
    const catAusencia = ocorrencias
      .map((o) => OCORRENCIA_CATEGORIA[o.tipo])
      .find((c) => c === "ausente" || c === "atestado");

    if (principal && catAusencia && categoriasTrabalho.includes(principal.categoria)) {
      contagens[principal.categoria] -= 1;
      contagens[catAusencia] += 1;
      principal.categoria = catAusencia;
      principal.ocorrencias = ocorrencias;
      continue;
    }

    if (principal) {
      principal.ocorrencias = ocorrencias;
    }

    for (const o of ocorrencias) {
      const cat = OCORRENCIA_CATEGORIA[o.tipo];
      if (!cat) continue;
      // Ausência já é representada pela pessoa principal quando a categoria de
      // trabalho foi substituída. Para categorias sem pessoa, não contamos.
      if (
        CATS_OCORRENCIA_AUSENCIA.includes(cat) &&
        principal &&
        CATS_AUSENCIA.includes(principal.categoria)
      ) continue;
      if (principal) {
        pessoas.push({ ...principal, categoria: cat, ocorrencias: [o], ocorrencia_id: o.id });
        contagens[cat] += 1;
      } else if (colab) {
        pessoas.push({
          colaborador_id: colab.id,
          nome: colab.nome,
          categoria: cat,
          turno_id: null,
          turno_nome: null,
          entrada: null,
          saida: null,
          termina_no_dia_seguinte: false,
          carga_prevista_horas: 0,
          unidade_id: colab.unidade_id ?? null,
          cargo_id: colab.cargo_id ?? null,
          cargo_nome: colab.cargo_nome ?? null,
          socio: !!colab.socio,
          origem: "jornada",
          ocorrencias: [o],
          ocorrencia_id: o.id,
        });
        contagens[cat] += 1;
      }
    }
  }

  // Confirmados = fixos escalados + convocações aceitas.
  // Convocação pendente NUNCA entra em "trabalhando": ela é apenas "Aguardando".
  const trabalhando = contagens.fixo + contagens.convocado_aceito;
  const aguardando = contagens.convocado_pendente;
  const contagens_avulsos: ContagensAvulsos = {
    teste: (input.avulsos ?? []).filter((a) => a.tipo === "teste" && data >= a.data_inicio && data <= a.data_fim).length,
    folguista: (input.avulsos ?? []).filter((a) => a.tipo === "folguista" && data >= a.data_inicio && data <= a.data_fim).length,
  };
  return { data, dow, contagens, contagens_avulsos, trabalhando, aguardando, pessoas };
}

export interface HorarioSugerido {
  entrada: string;
  saida: string;
  termina_no_dia_seguinte: boolean;
}

/**
 * Sugere o horário mais usado para um cargo/unidade em determinado dia da
 * semana, olhando as pessoas previstas no mês carregado. Fallback para o
 * horário mais usado da unidade (qualquer cargo) e, por fim, nulo.
 * Empate: escolhe o par que aparece no dia mais recente.
 */
export function horarioMaisUsado({
  dias,
  unidadeId,
  cargoId,
  dow,
}: {
  dias: ResultadoDia[];
  unidadeId: string;
  cargoId: string;
  dow: number;
}): HorarioSugerido | null {
  const candidatos = new Map<
    string,
    { entrada: string; saida: string; termina_no_dia_seguinte: boolean; data: string }
  >();

  const porCargo = (p: PessoaPanorama) => p.unidade_id === unidadeId && p.cargo_id === cargoId;
  const porUnidade = (p: PessoaPanorama) => p.unidade_id === unidadeId;

  function coletar(filtro: (p: PessoaPanorama) => boolean) {
    for (const d of dias) {
      if (d.dow !== dow) continue;
      for (const p of d.pessoas) {
        if (!filtro(p) || !p.entrada || !p.saida) continue;
        const chave = `${p.entrada}|${p.saida}|${p.termina_no_dia_seguinte}`;
        const atual = candidatos.get(chave);
        if (!atual || d.data > atual.data) {
          candidatos.set(chave, {
            entrada: p.entrada,
            saida: p.saida,
            termina_no_dia_seguinte: p.termina_no_dia_seguinte,
            data: d.data,
          });
        }
      }
    }
  }

  coletar(porCargo);
  if (candidatos.size === 0) coletar(porUnidade);
  if (candidatos.size === 0) return null;

  const contagens = new Map<string, number>();
  for (const d of dias) {
    if (d.dow !== dow) continue;
    for (const p of d.pessoas) {
      if (!porCargo(p) && !porUnidade(p)) continue;
      if (!p.entrada || !p.saida) continue;
      const chave = `${p.entrada}|${p.saida}|${p.termina_no_dia_seguinte}`;
      if (!candidatos.has(chave)) continue;
      contagens.set(chave, (contagens.get(chave) ?? 0) + 1);
    }
  }

  let melhorChave: string | null = null;
  let melhorContagem = 0;
  let melhorData = "";
  for (const [chave, info] of candidatos) {
    const contagem = contagens.get(chave) ?? 0;
    const vence =
      contagem > melhorContagem ||
      (contagem === melhorContagem && (melhorChave == null || info.data > melhorData));
    if (vence) {
      melhorChave = chave;
      melhorContagem = contagem;
      melhorData = info.data;
    }
  }

  if (!melhorChave) return null;
  const escolhido = candidatos.get(melhorChave)!;
  return {
    entrada: escolhido.entrada,
    saida: escolhido.saida,
    termina_no_dia_seguinte: escolhido.termina_no_dia_seguinte,
  };
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

type OptsBaseline = {
  limite?: string;
  semanas?: number;
  /** Datas ISO consideradas feriado — ficam fora do padrão do dia da semana. */
  feriados?: ReadonlySet<string>;
};

function amostras(
  historico: { data: string; trabalhando: number }[],
  opts: OptsBaseline | undefined,
  filtro: (data: string) => boolean,
): number[][] {
  const semanas = opts?.semanas ?? SEMANAS_BASELINE;
  const limite = opts?.limite;
  const inicio = limite ? somarDias(limite, -semanas * 7) : null;
  const out: number[][] = [];
  for (const h of historico) {
    if (limite && h.data >= limite) continue;
    if (inicio && h.data < inicio) continue;
    if (h.trabalhando <= 0) continue;
    if (!filtro(h.data)) continue;
    out.push([dowDaData(h.data), h.trabalhando]);
  }
  return out;
}

/**
 * Mediana de pessoas trabalhando por dia da semana, a partir dos dias já
 * ocorridos. Dias sem ninguém na operação não entram (loja fechada/sem dado).
 * Feriados também ficam fora: eles têm operação própria e contaminariam o
 * padrão do dia comum.
 */
export function baselinePorDow(
  historico: { data: string; trabalhando: number }[],
  opts?: OptsBaseline,
): Map<number, number> {
  const feriados = opts?.feriados;
  const porDow = new Map<number, number[]>();
  for (const [dow, valor] of amostras(historico, opts, (d) => !feriados?.has(d))) {
    const lista = porDow.get(dow) ?? [];
    lista.push(valor);
    porDow.set(dow, lista);
  }

  const out = new Map<number, number>();
  for (const [dow, valores] of porDow) out.set(dow, mediana(valores));
  return out;
}

/** Quantos feriados anteriores são necessários para ter padrão de feriado. */
export const MIN_AMOSTRAS_FERIADO = 2;

/**
 * Padrão de feriado: mediana dos feriados já ocorridos na janela. Retorna null
 * quando não há histórico suficiente — nesse caso o dia não gera alerta
 * quantitativo, para não comparar feriado com dia comum.
 */
export function baselineFeriado(
  historico: { data: string; trabalhando: number }[],
  opts?: OptsBaseline,
): number | null {
  const feriados = opts?.feriados;
  if (!feriados || feriados.size === 0) return null;
  const valores = amostras(historico, opts, (d) => feriados.has(d)).map(([, v]) => v);
  if (valores.length < MIN_AMOSTRAS_FERIADO) return null;
  return mediana(valores);
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

export function mensagemAlerta(
  dia: ResultadoDia & { feriado_nome?: string | null },
  avaliacao: AvaliacaoDia,
  unidade?: string | null,
): string {
  const base = dia.feriado_nome ? "feriados" : DOW_PLURAL[dia.dow];
  const alvo = `${base}${unidade ? ` na ${unidade}` : ""}`;
  const rotulo = avaliacao.situacao === "abaixo" ? "abaixo do padrão" : "acima do padrão";
  return `Previsto ${dia.trabalhando}, padrão ${avaliacao.padrao} para ${alvo} — ${rotulo}.`;
}

// ------------------------------------------------------------------
// Blocos por período de funcionamento da unidade, agrupados por cargo
// ------------------------------------------------------------------

export interface GrupoCargo {
  cargo_id: string | null;
  cargo_nome: string;
  /** Setor do grupo, preenchido quando o agrupamento é por setor. */
  setor_id?: string | null;
  pessoas: PessoaPanorama[];
}

/** Dimensão usada para agrupar as pessoas dentro de cada período do dia. */
export type AgrupamentoEquipe = "cargo" | "setor";

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
export const SEM_SETOR_LABEL = "Sem Setor Definido";

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

/** Agrupa por setor efetivo do dia; quem está sem setor fica num grupo à parte. */
function agruparPorSetor(pessoas: PessoaPanorama[]): GrupoCargo[] {
  const mapa = new Map<string, GrupoCargo>();
  for (const p of pessoas) {
    const chave = p.setor_id ?? "sem-setor";
    const atual = mapa.get(chave) ?? {
      cargo_id: null,
      cargo_nome: p.setor_id ? p.setor_nome ?? SEM_SETOR_LABEL : SEM_SETOR_LABEL,
      setor_id: p.setor_id ?? null,
      pessoas: [],
    };
    atual.pessoas.push(p);
    mapa.set(chave, atual);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, pessoas: [...g.pessoas].sort((a, b) => a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => {
      if (!a.setor_id) return 1;
      if (!b.setor_id) return -1;
      return a.cargo_nome.localeCompare(b.cargo_nome);
    });
}

/** Agrupa a equipe do período pela dimensão escolhida na tela. */
export function agruparEquipe(
  pessoas: PessoaPanorama[],
  agrupar: AgrupamentoEquipe = "cargo",
): GrupoCargo[] {
  return agrupar === "setor" ? agruparPorSetor(pessoas) : agruparPorCargo(pessoas);
}

/** Minutos do período, esticando o fechamento quando ele vira o dia. */
function janelaPeriodo(p: HorarioFuncionamentoPeriodo): { abre: number; fecha: number } | null {
  const abre = paraMinutos(p.hora_abertura ?? "");
  const fecha0 = paraMinutos(p.hora_fechamento ?? "");
  if (abre === null || fecha0 === null) return null;
  return { abre, fecha: fecha0 <= abre ? fecha0 + 24 * 60 : fecha0 };
}

/** Janela da jornada da pessoa em minutos, esticando quando vira o dia. */
function janelaPessoa(p: PessoaPanorama): { abre: number; fecha: number } | null {
  const entrada = paraMinutos(p.entrada ?? "");
  if (entrada === null) return null;
  const saida0 = paraMinutos(p.saida ?? "");
  const saida = saida0 === null ? entrada : saida0 <= entrada ? saida0 + 24 * 60 : saida0;
  return { abre: entrada, fecha: saida };
}

/**
 * Minutos em comum entre a jornada e a janela do período. Compara também a
 * jornada deslocada em um dia para os dois lados, para que quem trabalha na
 * virada da meia-noite continue caindo no período noturno da loja.
 */
const DIA_MIN = 24 * 60;

function sobreposicaoJanelas(
  j: { abre: number; fecha: number },
  janela: { abre: number; fecha: number },
): number {
  return [-DIA_MIN, 0, DIA_MIN].reduce((maior, deslocamento) => {
    const min = Math.max(
      0,
      Math.min(j.fecha + deslocamento, janela.fecha) - Math.max(j.abre + deslocamento, janela.abre),
    );
    return Math.max(maior, min);
  }, 0);
}

function sobreposicao(p: PessoaPanorama, janela: { abre: number; fecha: number }): number {
  const j = janelaPessoa(p);
  if (!j) return 0;
  return sobreposicaoJanelas(j, janela);
}


/**
 * Cada pessoa entra em UM único período do dia: aquele em que ela passa mais
 * tempo trabalhando (maior sobreposição de minutos com a jornada). Empate é
 * resolvido pelo período em que a entrada dela cai. Devolve o índice do
 * período escolhido, ou null quando não há sobreposição alguma.
 */
export function melhorPeriodo(
  p: PessoaPanorama,
  janelas: ({ abre: number; fecha: number } | null)[],
): number | null {
  const j = janelaPessoa(p);
  if (!j) return null;

  const contemEntrada = janelas.findIndex(
    (w) => !!w && j.abre >= w.abre && j.abre < w.fecha,
  );

  let melhor: number | null = null;
  let maior = 0;
  janelas.forEach((w, i) => {
    if (!w) return;
    const min = sobreposicao(p, w);
    if (min <= 0) return;
    if (min > maior || (min === maior && i === contemEntrada)) {
      maior = min;
      melhor = i;
    }
  });
  return melhor;
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
  /** Dimensão dos grupos dentro de cada período (padrão: cargo). */
  agrupar?: AgrupamentoEquipe;
}): BlocoFuncionamento[] {
  const agrupar = (pessoas: PessoaPanorama[]) => agruparEquipe(pessoas, input.agrupar ?? "cargo");
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
    const janelas = periodos.map(janelaPeriodo);

    // Cada pessoa entra em um único período: evita a mesma pessoa aparecer no
    // "Dia" e na "Noite" só porque a jornada dela encosta nos dois.
    const pessoasPorPeriodo: PessoaPanorama[][] = periodos.map(() => []);
    for (const p of daUnidade) {
      const idx = melhorPeriodo(p, janelas);
      if (idx === null) continue;
      pessoasPorPeriodo[idx].push(p);
      alocadas.add(p.colaborador_id);
    }

    periodos.forEach((per, i) => {
      const pessoas = pessoasPorPeriodo[i];
      out.push({
        key: `${uid}-${i}`,
        titulo: per.nome?.trim() || `Período ${i + 1}`,
        horario: formatarPeriodo(per),
        unidade_id: uid,
        unidade_nome: nomeUnidade.get(uid) ?? null,
        fechado: false,
        pessoas,
        grupos: agrupar(pessoas),
      });
    });


    const naoAlocadas = daUnidade.filter((p) => !alocadas.has(p.colaborador_id));

    // Quem não tem horário preenchido não está "fora do horário da loja": está
    // sem horário definido. Separar evita o aviso errado na Rotina do Dia.
    const semHorario = periodos.length ? naoAlocadas.filter((p) => !janelaPessoa(p)) : [];
    if (semHorario.length) {
      out.push({
        key: `${uid}-sem-horario`,
        titulo: "Sem Horário Definido",
        horario: null,
        unidade_id: uid,
        unidade_nome: nomeUnidade.get(uid) ?? null,
        fechado: false,
        pessoas: semHorario,
        grupos: agrupar(semHorario),
      });
    }

    const restantes = periodos.length
      ? naoAlocadas.filter((p) => !!janelaPessoa(p))
      : naoAlocadas;
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
        grupos: agrupar(restantes),
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
      grupos: agrupar(semUnidade),
    });
  }

  return out;
}
