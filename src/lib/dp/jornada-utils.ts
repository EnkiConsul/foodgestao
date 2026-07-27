/**
 * Utilitários de jornada — cálculo de carga, resumo semanal e duplicação de horários.
 * Um horário pertence a um dia da semana (0 = domingo ... 6 = sábado).
 */

export const LIMITE_SEMANAL = 44;

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface HorarioDia {
  dia_semana: number;
  entrada: string; // "HH:MM"
  saida: string; // "HH:MM"
  intervalo_minutos: number;
  termina_no_dia_seguinte?: boolean;
}

export const DIAS_SEMANA: { v: DiaSemana; curto: string; longo: string }[] = [
  { v: 0, curto: "Dom", longo: "Domingo" },
  { v: 1, curto: "Seg", longo: "Segunda-feira" },
  { v: 2, curto: "Ter", longo: "Terça-feira" },
  { v: 3, curto: "Qua", longo: "Quarta-feira" },
  { v: 4, curto: "Qui", longo: "Quinta-feira" },
  { v: 5, curto: "Sex", longo: "Sexta-feira" },
  { v: 6, curto: "Sáb", longo: "Sábado" },
];

/** Ordem de exibição: começa na segunda e termina no domingo. */
export const ORDEM_EXIBICAO: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0];

export const DIAS_UTEIS: DiaSemana[] = [1, 2, 3, 4, 5];
export const FIM_DE_SEMANA: DiaSemana[] = [6, 0];

export const INTERVALOS_RAPIDOS = [15, 30, 45, 60, 90, 120];

/** "HH:MM" (ou "HH:MM:SS") -> minutos desde 00:00. Retorna null se inválido. */
export function paraMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Normaliza "HH:MM:SS" -> "HH:MM". */
export function hhmm(valor: string | null | undefined): string {
  return valor ? valor.slice(0, 5) : "";
}

/** Verdadeiro quando a saída cai no dia seguinte (jornada noturna). */
export function viraODia(entrada: string, saida: string): boolean {
  const e = paraMinutos(entrada);
  const s = paraMinutos(saida);
  if (e === null || s === null) return false;
  return s <= e;
}

/** Duração bruta do dia em minutos, considerando virada de meia-noite. */
export function duracaoBrutaMinutos(entrada: string, saida: string): number {
  const e = paraMinutos(entrada);
  const s = paraMinutos(saida);
  if (e === null || s === null) return 0;
  return s <= e ? s - e + 1440 : s - e;
}

/** Carga líquida do dia em horas (bruto - intervalo), arredondada em 2 casas. */
export function calcularCargaDia(h: Pick<HorarioDia, "entrada" | "saida" | "intervalo_minutos">): number {
  const bruto = duracaoBrutaMinutos(h.entrada, h.saida);
  if (bruto <= 0) return 0;
  const liquido = bruto - Math.max(0, h.intervalo_minutos ?? 0);
  if (liquido <= 0) return 0;
  return Math.round((liquido / 60) * 100) / 100;
}

/** Soma da carga de todos os dias informados. */
export function calcularCargaSemanal(horarios: HorarioDia[]): number {
  const total = horarios.reduce((acc, h) => acc + calcularCargaDia(h), 0);
  return Math.round(total * 100) / 100;
}

/** Alias explícito: carga somada de todos os dias cadastrados na jornada. */
export function calcularCargaTotalCadastrada(horarios: HorarioDia[]): number {
  return calcularCargaSemanal(horarios);
}

const arred = (n: number) => Math.round(n * 100) / 100;

/** Carga semanal descontando um único dia de folga fixa. */
export function calcularCargaComFolgaFixa(horarios: HorarioDia[], diaFolga: number | null | undefined): number {
  if (diaFolga == null) return calcularCargaSemanal(horarios);
  return calcularCargaComFolgas(horarios, [diaFolga]);
}

/** Carga semanal descontando um conjunto de dias de folga. */
export function calcularCargaComFolgas(horarios: HorarioDia[], diasFolga: number[]): number {
  const folgas = new Set(diasFolga);
  return arred(
    horarios.reduce((acc, h) => (folgas.has(h.dia_semana) ? acc : acc + calcularCargaDia(h)), 0),
  );
}

export interface SimulacaoFolga {
  dia: number;
  rotulo: string;
  carga: number;
}

/** Carga resultante ao folgar em cada um dos dias cadastrados. */
export function simularCargaPorDiaDeFolga(horarios: HorarioDia[]): SimulacaoFolga[] {
  return ORDEM_EXIBICAO.filter((d) => horarios.some((h) => h.dia_semana === d)).map((d) => ({
    dia: d,
    rotulo: DIAS_SEMANA.find((x) => x.v === d)!.longo,
    carga: calcularCargaComFolgas(horarios, [d]),
  }));
}

/** Carga da semana efetivamente montada na escala: soma apenas os dias escalados. */
export function calcularCargaDaEscala(
  horarios: HorarioDia[],
  diasEscalados: number[],
): number {
  const escalados = new Set(diasEscalados);
  return arred(
    horarios.reduce((acc, h) => (escalados.has(h.dia_semana) ? acc + calcularCargaDia(h) : acc), 0),
  );
}

export interface ValidacaoCarga {
  carga: number;
  limite: number;
  excede: boolean;
  excedente: number;
}

/** Valida a carga semanal contra o limite legal (padrão 44h). */
export function validarCargaSemanal(carga: number, limite: number = LIMITE_SEMANAL): ValidacaoCarga {
  const excede = arred(carga) > limite;
  return { carga: arred(carga), limite, excede, excedente: excede ? arred(carga - limite) : 0 };
}

/** Quantidade de folgas semanais previstas pelo regime. Null = indefinido/variável. */
export function folgasPorRegime(tipoEscala: string): number | null {
  switch (tipoEscala) {
    case "6x1":
    case "5x1":
      return 1;
    case "5x2":
    case "4x2":
      return 2;
    default:
      return null; // 12x36, intermitente, personalizada
  }
}

export interface CargaEstimada {
  /** Menor carga possível (folga nos dias mais pesados). */
  minima: number;
  /** Maior carga possível (folga nos dias mais leves). */
  maxima: number;
  folgas: number;
}

/**
 * Faixa estimada de carga semanal conforme o regime.
 * Retorna null quando o regime não define um número fixo de folgas (12x36, personalizada…).
 */
export function cargaEstimadaPorRegime(horarios: HorarioDia[], tipoEscala: string): CargaEstimada | null {
  const folgas = folgasPorRegime(tipoEscala);
  if (!folgas || horarios.length === 0) return null;
  const cargas = horarios.map(calcularCargaDia).sort((a, b) => a - b);
  if (cargas.length <= folgas) return null;
  const total = cargas.reduce((a, b) => a + b, 0);
  const maisPesados = cargas.slice(-folgas).reduce((a, b) => a + b, 0);
  const maisLeves = cargas.slice(0, folgas).reduce((a, b) => a + b, 0);
  return { minima: arred(total - maisPesados), maxima: arred(total - maisLeves), folgas };
}


/** Formata horas decimais como "8h" ou "7h30". */
export function formatarHoras(horas: number): string {
  if (!Number.isFinite(horas) || horas <= 0) return "0h";
  const totalMin = Math.round(horas * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Formata minutos de intervalo de forma amigável. */
export function formatarIntervalo(minutos: number): string {
  if (!minutos) return "Sem intervalo";
  if (minutos < 60) return `${minutos} minutos`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h de intervalo` : `${h}h${String(m).padStart(2, "0")} de intervalo`;
}

export interface FaixaResumo {
  dias: number[];
  rotulo: string;
  detalhe: string;
}

/**
 * Resumo agrupado por faixas contíguas de dias com o mesmo horário.
 * Ex.: [{ rotulo: "Seg–Sex", detalhe: "08:00–17:00" }, { rotulo: "Dom", detalhe: "Folga" }]
 */
export function resumoJornada(horarios: HorarioDia[]): FaixaResumo[] {
  const porDia = new Map<number, HorarioDia>();
  for (const h of horarios) porDia.set(h.dia_semana, h);

  const faixas: FaixaResumo[] = [];
  let atual: { dias: number[]; chave: string; detalhe: string } | null = null;

  const fechar = () => {
    if (!atual) return;
    const primeiro = DIAS_SEMANA.find((d) => d.v === atual!.dias[0])!.curto;
    const ultimo = DIAS_SEMANA.find((d) => d.v === atual!.dias[atual!.dias.length - 1])!.curto;
    const rotulo =
      atual.dias.length === 1 ? primeiro : atual.dias.length === 2 ? `${primeiro} e ${ultimo}` : `${primeiro}–${ultimo}`;
    faixas.push({ dias: [...atual.dias], rotulo, detalhe: atual.detalhe });
    atual = null;
  };

  for (const dia of ORDEM_EXIBICAO) {
    const h = porDia.get(dia);
    const detalhe = h ? `${hhmm(h.entrada)}–${hhmm(h.saida)}` : "Folga";
    const chave = h ? `${detalhe}|${h.intervalo_minutos}` : "folga";
    if (atual && atual.chave === chave) {
      atual.dias.push(dia);
    } else {
      fechar();
      atual = { dias: [dia], chave, detalhe };
    }
  }
  fechar();
  return faixas;
}

/** Texto curto do resumo: "Seg–Sex 08:00–17:00 · Sáb 08:00–14:00 · Dom Folga". */
export function resumoJornadaTexto(horarios: HorarioDia[]): string {
  return resumoJornada(horarios)
    .map((f) => `${f.rotulo} ${f.detalhe}`)
    .join(" · ");
}

/** Copia o horário de um dia para os dias de destino, preservando os demais. */
export function duplicarHorario(
  horarios: HorarioDia[],
  origem: number,
  destinos: number[],
): HorarioDia[] {
  const base = horarios.find((h) => h.dia_semana === origem);
  if (!base) return horarios;
  const alvos = new Set(destinos.filter((d) => d !== origem));
  const resultado = horarios.map((h) =>
    alvos.has(h.dia_semana)
      ? {
          ...h,
          entrada: base.entrada,
          saida: base.saida,
          intervalo_minutos: base.intervalo_minutos,
          termina_no_dia_seguinte: viraODia(base.entrada, base.saida),
        }
      : h,
  );
  for (const d of alvos) {
    if (!resultado.some((h) => h.dia_semana === d)) {
      resultado.push({
        dia_semana: d,
        entrada: base.entrada,
        saida: base.saida,
        intervalo_minutos: base.intervalo_minutos,
        termina_no_dia_seguinte: viraODia(base.entrada, base.saida),
      });
    }
  }
  return resultado.sort((a, b) => ORDEM_EXIBICAO.indexOf(a.dia_semana as DiaSemana) - ORDEM_EXIBICAO.indexOf(b.dia_semana as DiaSemana));
}

/** Horário previsto para uma data específica (usa o dia da semana local). */
export function horarioDaData(horarios: HorarioDia[], data: Date | string): HorarioDia | null {
  const d = typeof data === "string" ? new Date(`${data.slice(0, 10)}T12:00:00`) : data;
  if (Number.isNaN(d.getTime())) return null;
  return horarios.find((h) => h.dia_semana === d.getDay()) ?? null;
}

export interface ValidacaoHorario {
  dia_semana: number;
  erro: string;
}

/** Valida a semana inteira. Retorna a lista de problemas encontrados. */
export function validarSemana(horarios: HorarioDia[], opts?: { menorDeIdade?: boolean }): ValidacaoHorario[] {
  const erros: ValidacaoHorario[] = [];
  for (const h of horarios) {
    const e = paraMinutos(h.entrada);
    const s = paraMinutos(h.saida);
    if (e === null || s === null) {
      erros.push({ dia_semana: h.dia_semana, erro: "Informe entrada e saída" });
      continue;
    }
    if (e === s) {
      erros.push({ dia_semana: h.dia_semana, erro: "Entrada e saída não podem ser iguais" });
      continue;
    }
    const bruto = duracaoBrutaMinutos(h.entrada, h.saida);
    if ((h.intervalo_minutos ?? 0) >= bruto) {
      erros.push({ dia_semana: h.dia_semana, erro: "O intervalo é maior que a duração do dia" });
      continue;
    }
    if (calcularCargaDia(h) <= 0) {
      erros.push({ dia_semana: h.dia_semana, erro: "A carga do dia precisa ser positiva" });
      continue;
    }
    if (opts?.menorDeIdade && (viraODia(h.entrada, h.saida) || s > 22 * 60)) {
      erros.push({ dia_semana: h.dia_semana, erro: "Menores não podem encerrar após as 22:00" });
    }
  }
  return erros;
}

/** Sugere um horário para um dia recém-marcado, herdando o primeiro já configurado. */
export function horarioHerdado(horarios: HorarioDia[], dia: number): HorarioDia {
  const base = ORDEM_EXIBICAO.map((d) => horarios.find((h) => h.dia_semana === d)).find(Boolean);
  return {
    dia_semana: dia,
    entrada: base?.entrada ?? "08:00",
    saida: base?.saida ?? "17:00",
    intervalo_minutos: base?.intervalo_minutos ?? 60,
    termina_no_dia_seguinte: base ? viraODia(base.entrada, base.saida) : false,
  };
}
