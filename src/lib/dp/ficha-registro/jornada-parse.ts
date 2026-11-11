/**
 * Interpretação da jornada escrita nas fichas de registro.
 *
 * Dois formatos aparecem nos modelos usados pelos escritórios contábeis:
 *  - compacto, numa linha: "08:00/12:00-14:00/18:00 44:00" (entrada / intervalo / saída)
 *    ou "das 17:00 as 00:35" (sem intervalo declarado);
 *  - tabela por dia da semana, com entrada, saída de intervalo, entrada de
 *    intervalo e saída — nesse caso a leitura já chega estruturada por dia.
 *
 * O resultado é sempre uma SUGESTÃO: quem confirma é o usuário na revisão.
 */

export type JornadaDia = {
  /** 0 = domingo … 6 = sábado */
  dow: number;
  trabalha: boolean;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number | null;
};

export type JornadaSugerida = {
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number | null;
  /** Jornada que termina no dia seguinte (vira a meia-noite). */
  vira_meia_noite: boolean;
  dias: JornadaDia[];
  /** Não deu para interpretar nada de confiável. */
  vazia: boolean;
  /** A ficha declara um intervalo que não deu para ler com segurança: conferir. */
  intervalo_incerto?: boolean;
};

const HHMM = /([0-2]?\d)[:h]([0-5]\d)/g;

/** Normaliza "8:5" → "08:05"; devolve null quando não é hora válida. */
export function normalizeHora(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^\s*([0-2]?\d)[:h]?([0-5]\d)\s*$/.exec(String(value));
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Diferença em minutos considerando virada de meia-noite. */
export function minutosEntre(inicio: string, fim: string): number {
  const a = toMinutes(inicio);
  const b = toMinutes(fim);
  return b >= a ? b - a : 24 * 60 - a + b;
}

export function viraMeiaNoite(entrada: string | null, saida: string | null): boolean {
  if (!entrada || !saida) return false;
  return toMinutes(saida) <= toMinutes(entrada);
}

const DOW_ALIASES: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2, terça: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6, sábado: 6,
};

/** Converte "Qua", "quarta-feira", "SAB" em 0..6 (null quando não reconhece). */
export function parseDow(label: string | null | undefined): number | null {
  if (!label) return null;
  const key = String(label)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 7);
  for (const alias of Object.keys(DOW_ALIASES)) {
    if (key.startsWith(alias)) return DOW_ALIASES[alias];
  }
  return null;
}

/** Intervalo aceito pelo cadastro (o servidor recusa acima disso). */
export const INTERVALO_MAX_MINUTOS = 480;

function horasDoTexto(texto: string): string[] {
  const horas: string[] = [];
  for (const m of texto.matchAll(HHMM)) {
    const h = normalizeHora(`${m[1]}:${m[2]}`);
    if (h) horas.push(h);
  }
  return horas;
}

/** O intervalo [ini, fim] cabe dentro da jornada [entrada, saida] (com virada)? */
function intervaloDentroDaJornada(entrada: string, saida: string, ini: string, fim: string): boolean {
  const span = minutosEntre(entrada, saida);
  const aIni = minutosEntre(entrada, ini);
  const aFim = minutosEntre(entrada, fim);
  return span > 0 && aIni > 0 && aFim > aIni && aFim < span;
}

/** Intervalo coerente: entre 0 e o limite do cadastro, e menor que a própria jornada. */
export function intervaloCoerente(
  entrada: string | null,
  saida: string | null,
  intervalo: number | null | undefined,
): boolean {
  if (intervalo === null || intervalo === undefined) return true;
  if (!Number.isFinite(intervalo) || intervalo < 0 || intervalo > INTERVALO_MAX_MINUTOS) return false;
  if (!entrada || !saida) return true;
  const span = minutosEntre(entrada, saida);
  return span === 0 || intervalo < span;
}

/**
 * Lê a jornada em linha única. Aceita:
 *  - "08:00/12:00-14:00/18:00 44:00" (entrada, saída e volta do intervalo, saída)
 *  - "das 17:00 as 00:35"
 *  - "das 10:00 as 17:50 / Horário de Intervalo das 12:00 as 12:30" (jornada e
 *    intervalo em blocos separados, como nos modelos de vários escritórios)
 *
 * Nunca devolve intervalo incoerente: quando o texto declara um intervalo que
 * não dá para ler com segurança, ele fica vazio e `intervalo_incerto` avisa
 * que a pessoa precisa conferir o horário.
 */
export function parseJornadaCompacta(texto: string | null | undefined): {
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number | null;
  intervalo_incerto: boolean;
} {
  const vazio = { entrada: null, saida: null, intervalo_minutos: null, intervalo_incerto: false };
  if (!texto) return vazio;

  // A carga semanal no fim da linha ("44:00") não é hora válida e cai fora sozinha
  // na normalização; horas como "00:35" (virada de meia-noite) são preservadas.
  const limpo = String(texto);
  const resultado = (entrada: string | null, saida: string | null, intervalo: number | null, incerto = false) =>
    intervaloCoerente(entrada, saida, intervalo)
      ? { entrada, saida, intervalo_minutos: intervalo, intervalo_incerto: incerto }
      : { entrada, saida, intervalo_minutos: null, intervalo_incerto: true };

  // Blocos separados: o que vem antes de "intervalo" é a jornada; depois, o descanso.
  const marca = /intervalo|\bint\.|almo[cç]o|descanso/i.exec(limpo);
  if (marca) {
    const trabalho = horasDoTexto(limpo.slice(0, marca.index));
    const descansoTexto = limpo.slice(marca.index);
    const descanso = horasDoTexto(descansoTexto);
    if (trabalho.length >= 2) {
      const [entrada, saida] = trabalho;
      if (descanso.length >= 2) return resultado(entrada, saida, minutosEntre(descanso[0], descanso[1]));
      const emMinutos = /(\d{1,3})\s*(?:min|minutos)\b/i.exec(descansoTexto);
      if (emMinutos) return resultado(entrada, saida, Number(emMinutos[1]));
      if (descanso.length === 1) {
        // "Intervalo de 01:00" = duração; acima de 4h não é duração plausível.
        const [h, m] = descanso[0].split(":").map(Number);
        const dur = h * 60 + m;
        return dur > 0 && dur <= 240 ? resultado(entrada, saida, dur) : resultado(entrada, saida, null, true);
      }
      return resultado(entrada, saida, null, /\d/.test(descansoTexto));
    }
    // Sem jornada antes da palavra: cai na leitura sequencial abaixo.
  }

  const horas = horasDoTexto(limpo);
  if (horas.length === 0) return vazio;

  if (horas.length >= 4) {
    const [h1, h2, h3, h4] = horas;
    const classico = minutosEntre(h2, h3);
    // Formato clássico: entrada / saída para o intervalo – volta / saída.
    if (intervaloDentroDaJornada(h1, h4, h2, h3) && intervaloCoerente(h1, h4, classico)) {
      return resultado(h1, h4, classico);
    }
    // Jornada primeiro e intervalo depois, sem a palavra "intervalo".
    if (intervaloDentroDaJornada(h1, h2, h3, h4)) return resultado(h1, h2, minutosEntre(h3, h4));
    return resultado(h1, h4, null, true);
  }
  if (horas.length === 3) {
    // Sem informação suficiente para o intervalo: fica a entrada e a saída.
    return { entrada: horas[0], saida: horas[2], intervalo_minutos: null, intervalo_incerto: false };
  }
  if (horas.length === 2) {
    return { entrada: horas[0], saida: horas[1], intervalo_minutos: null, intervalo_incerto: false };
  }
  return { entrada: horas[0], saida: null, intervalo_minutos: null, intervalo_incerto: false };
}

export type DiaLidoDaFicha = {
  dow?: number | null;
  dia?: string | null;
  trabalha?: boolean | null;
  tipo?: string | null;
  entrada?: string | null;
  saida?: string | null;
  intervalo_inicio?: string | null;
  intervalo_fim?: string | null;
  intervalo_minutos?: number | null;
};

/**
 * Monta a jornada sugerida a partir do que a leitura devolveu:
 * a tabela por dia tem prioridade; a linha compacta cobre os dias sem detalhe.
 */
export function montarJornadaSugerida(input: {
  jornada_texto?: string | null;
  jornada_dias?: DiaLidoDaFicha[] | null;
  folga_dow?: number | null;
}): JornadaSugerida {
  const base = parseJornadaCompacta(input.jornada_texto);

  const porDow = new Map<number, JornadaDia>();
  let incertoNaTabela = false;
  for (const d of input.jornada_dias ?? []) {
    const dow = typeof d.dow === "number" ? d.dow : parseDow(d.dia);
    if (dow === null || dow === undefined || dow < 0 || dow > 6) continue;

    const tipo = (d.tipo ?? "").toLowerCase();
    const folga = tipo.includes("folga") || tipo.includes("descanso") || d.trabalha === false;
    const entrada = normalizeHora(d.entrada);
    const saida = normalizeHora(d.saida);
    const ini = normalizeHora(d.intervalo_inicio);
    const fim = normalizeHora(d.intervalo_fim);
    const intervaloLido =
      typeof d.intervalo_minutos === "number" && d.intervalo_minutos >= 0
        ? d.intervalo_minutos
        : ini && fim
          ? minutosEntre(ini, fim)
          : null;
    const coerente = intervaloCoerente(entrada, saida, intervaloLido);
    if (!coerente && !folga) incertoNaTabela = true;
    const intervalo = coerente ? intervaloLido : null;

    porDow.set(dow, {
      dow,
      trabalha: !folga && !!entrada && !!saida,
      entrada: folga ? null : entrada,
      saida: folga ? null : saida,
      intervalo_minutos: folga ? null : intervalo,
    });
  }

  const dias: JornadaDia[] = [];
  for (let dow = 0; dow <= 6; dow++) {
    const lido = porDow.get(dow);
    if (lido) {
      dias.push(lido);
      continue;
    }
    const folga = input.folga_dow === dow;
    const trabalha = !folga && !!base.entrada && !!base.saida;
    dias.push({
      dow,
      trabalha,
      entrada: trabalha ? base.entrada : null,
      saida: trabalha ? base.saida : null,
      intervalo_minutos: trabalha ? base.intervalo_minutos : null,
    });
  }

  const trabalhados = dias.filter((d) => d.trabalha);
  const entrada = trabalhados[0]?.entrada ?? base.entrada;
  const saida = trabalhados[0]?.saida ?? base.saida;

  return {
    entrada,
    saida,
    intervalo_minutos: trabalhados[0]?.intervalo_minutos ?? base.intervalo_minutos,
    vira_meia_noite: viraMeiaNoite(entrada, saida),
    dias,
    vazia: trabalhados.length === 0 && !base.entrada,
    intervalo_incerto: incertoNaTabela || (base.intervalo_incerto && trabalhados.some((d) => !porDow.has(d.dow))),
  };
}

/**
 * Horário que não pode ir para o cadastro sem conferência: intervalo ilegível
 * na ficha, ou dia trabalhado com intervalo fora do possível. A ficha não é
 * gravada às cegas — ela é sinalizada para a pessoa corrigir.
 */
export function problemasJornada(j: JornadaSugerida | null | undefined): string[] {
  if (!j || j.vazia) return [];
  const problemas: string[] = [];
  if (j.intervalo_incerto) problemas.push("O intervalo escrito na ficha não pôde ser lido com segurança.");
  const ruins = j.dias.filter((d) => d.trabalha && !intervaloCoerente(d.entrada, d.saida, d.intervalo_minutos));
  if (ruins.length > 0) {
    problemas.push(`Intervalo maior que a jornada ou acima de ${INTERVALO_MAX_MINUTOS / 60} horas.`);
  }
  if (j.dias.some((d) => d.trabalha && (!d.entrada || !d.saida))) {
    problemas.push("Dia trabalhado sem entrada ou saída.");
  }
  return problemas;
}
