// Motor puro da Calculadora de Compensação (simulação em memória).
// Sem banco, sem relógio, sem navegador: tudo entra por parâmetro.
// Unidade interna: minutos inteiros (frações arredondadas ao minuto mais próximo).

export type ParseHorasResult =
  | { ok: true; minutos: number }
  | { ok: false; erro: string };

const MAX_MINUTOS = 10_000 * 60; // teto de sanidade: 10.000h

/** Arredonda ao minuto mais próximo, simétrico para negativos (half away from zero). */
export function arredondarMinuto(valor: number): number {
  const r = Math.sign(valor) * Math.round(Math.abs(valor));
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Converte o saldo digitado em minutos.
 * Aceita: "10", "10,5", "10.5", "10:30", "10h", "10h30", "10h30min", "-2:15", "+1,25".
 */
export function parseHoras(entrada: string | null | undefined): ParseHorasResult {
  const bruto = (entrada ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!bruto) return { ok: false, erro: "Informe o saldo de horas." };

  let sinal = 1;
  let s = bruto;
  if (s[0] === "-" || s[0] === "+") {
    if (s[0] === "-") sinal = -1;
    s = s.slice(1);
  }
  if (!s) return { ok: false, erro: "Saldo inválido." };

  let minutos: number;
  const hhmm = s.match(/^(\d{1,5}):(\d{1,2})$/);
  const hMin = s.match(/^(\d{1,5})h(?:(\d{1,2})(?:min|m)?)?$/);
  const soMin = s.match(/^(\d{1,6})(?:min|m)$/);
  const dec = s.match(/^(\d{1,5})(?:[.,](\d+))?$/);

  if (hhmm || hMin) {
    const m = (hhmm ?? hMin)!;
    const h = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    if (mm > 59) return { ok: false, erro: "Os minutos devem ficar entre 00 e 59." };
    minutos = h * 60 + mm;
  } else if (soMin) {
    minutos = Number(soMin[1]);
  } else if (dec) {
    const valor = Number(`${dec[1]}.${dec[2] ?? "0"}`);
    minutos = arredondarMinuto(valor * 60);
  } else {
    return { ok: false, erro: "Use formatos como 10,5 ou 10:30." };
  }

  if (!Number.isFinite(minutos) || minutos > MAX_MINUTOS) {
    return { ok: false, erro: "Saldo fora do limite permitido." };
  }
  const final = sinal * minutos;
  return { ok: true, minutos: Object.is(final, -0) ? 0 : final };
}

/** 620 → "10h20min"; 600 → "10h"; 45 → "45min"; -135 → "-2h15min"; 0 → "0h". */
export function formatarMinutos(minutos: number): string {
  const m = arredondarMinuto(minutos);
  if (m === 0) return "0h";
  const sinal = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  if (h === 0) return `${sinal}${r}min`;
  return r === 0 ? `${sinal}${h}h` : `${sinal}${h}h${String(r).padStart(2, "0")}min`;
}

/** Dia que pode virar folga compensatória, com a carga prevista (minutos). */
export interface DiaCompensavel {
  data: string; // AAAA-MM-DD
  minutos: number;
}

export type StatusSimulacao = "positivo" | "zerado" | "negativo_permitido" | "excede_limite";

export interface ResultadoSimulacao {
  saldoInicial: number;
  minutosUsados: number;
  saldoFinal: number;
  status: StatusSimulacao;
  dias: DiaCompensavel[];
}

function normalizarDias(dias: DiaCompensavel[]): DiaCompensavel[] {
  const vistos = new Set<string>();
  const out: DiaCompensavel[] = [];
  for (const d of dias) {
    const min = arredondarMinuto(d.minutos);
    if (!d.data || min <= 0 || vistos.has(d.data)) continue;
    vistos.add(d.data);
    out.push({ data: d.data, minutos: min });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Simula o abatimento dos dias escolhidos.
 * `limiteNegativo` = quantos minutos o saldo pode ficar abaixo de zero (padrão 0).
 */
export function simularCompensacao(params: {
  saldoMinutos: number;
  dias: DiaCompensavel[];
  limiteNegativo?: number;
}): ResultadoSimulacao {
  const saldoInicial = arredondarMinuto(params.saldoMinutos);
  const limite = Math.max(0, arredondarMinuto(params.limiteNegativo ?? 0));
  const dias = normalizarDias(params.dias);
  const minutosUsados = dias.reduce((s, d) => s + d.minutos, 0);
  const saldoFinal = saldoInicial - minutosUsados;
  const status: StatusSimulacao =
    saldoFinal > 0 ? "positivo"
    : saldoFinal === 0 ? "zerado"
    : -saldoFinal <= limite ? "negativo_permitido"
    : "excede_limite";
  return { saldoInicial, minutosUsados, saldoFinal, status, dias };
}

export interface SugestaoCompensacao {
  dias: DiaCompensavel[];
  minutosUsados: number;
  saldoFinal: number;
}

/** Lista de sugestões + indicação se a busca percorreu todo o espaço (sem corte por `maxNos`). */
export type ResultadoSugestoes = SugestaoCompensacao[] & { buscaCompleta: boolean };

/**
 * Sugere combinações de dias cujo total cabe no saldo (+ limite negativo).
 * Hierarquia: 1) menor |saldo final|; 2) menos folgas; 3) datas em ordem crescente.
 * Busca limitada (`maxNos`) para nunca travar a tela — resultado é a melhor encontrada,
 * não garantia de ótimo quando `buscaCompleta` = false.
 */
export function sugerirCombinacoes(params: {
  saldoMinutos: number;
  dias: DiaCompensavel[];
  limiteNegativo?: number;
  maxDias?: number;
  maxSugestoes?: number;
  maxNos?: number;
  /** Mantido por compatibilidade; ambos seguem a mesma hierarquia desde a Fase 2.2. */
  criterio?: "menor_sobra" | "menor_folgas";
}): ResultadoSugestoes {
  const saldo = arredondarMinuto(params.saldoMinutos);
  const limite = Math.max(0, arredondarMinuto(params.limiteNegativo ?? 0));
  const teto = saldo + limite;
  const maxDias = Math.max(1, params.maxDias ?? 5);
  const maxSugestoes = Math.max(1, params.maxSugestoes ?? 5);
  const maxNos = params.maxNos ?? 50_000;
  const dias = normalizarDias(params.dias);
  const comFlag = (lista: SugestaoCompensacao[], completa: boolean): ResultadoSugestoes =>
    Object.defineProperty(lista, "buscaCompleta", { value: completa, enumerable: false }) as ResultadoSugestoes;
  if (teto <= 0 || dias.length === 0) return comFlag([], true);

  const achadas: SugestaoCompensacao[] = [];
  const chaves = new Set<string>();
  let nos = 0;
  let interrompida = false;
  const atual: DiaCompensavel[] = [];

  const registrar = (soma: number) => {
    // assinatura por cargas: evita sugestões "iguais" só trocando dias de mesma carga
    const chave = atual.map((d) => d.minutos).sort((a, b) => a - b).join(",");
    if (chaves.has(chave)) return;
    chaves.add(chave);
    achadas.push({ dias: [...atual], minutosUsados: soma, saldoFinal: saldo - soma });
  };

  const buscar = (inicio: number, soma: number) => {
    if (nos++ > maxNos) { interrompida = true; return; }
    if (atual.length > 0) registrar(soma);
    if (atual.length >= maxDias) return;
    for (let i = inicio; i < dias.length; i++) {
      const nova = soma + dias[i].minutos;
      if (nova > teto) continue;
      atual.push(dias[i]);
      buscar(i + 1, nova);
      atual.pop();
      if (interrompida) return;
    }
  };
  buscar(0, 0);

  const datas = (x: SugestaoCompensacao) => x.dias.map((d) => d.data).join(",");
  const cmp = (a: SugestaoCompensacao, b: SugestaoCompensacao) =>
    Math.abs(a.saldoFinal) - Math.abs(b.saldoFinal) ||
    a.dias.length - b.dias.length ||
    datas(a).localeCompare(datas(b));
  return comFlag(achadas.sort(cmp).slice(0, maxSugestoes), !interrompida);
}
