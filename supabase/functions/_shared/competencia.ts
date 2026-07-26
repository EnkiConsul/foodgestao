// Detecção de competência (mês/ano) a partir do texto OCR de documentos de DP
// (contracheque, folha de ponto, adiantamento, décimo terceiro).
//
// Este módulo é compartilhado entre a edge function `dp-doc-bulk-ingest`
// e os testes unitários do front (vitest importa este arquivo diretamente).
// Não deve conter APIs específicas de Deno.

export const MESES_MAP: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3,
  abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6,
  julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9,
  outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12,
};

/** Palavras que indicam datas que NÃO são a competência do documento. */
const NOISE_LABELS = [
  "admissao", "admitido", "emissao", "emitido", "impressao", "impresso",
  "nascimento", "cadastro", "cadastrado", "pagamento em", "data de pagamento",
  "vencimento", "gerado em", "processado em", "assinatura",
];

function deaccentLower(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function ym(month: number, year: number): string | null {
  if (!month || month < 1 || month > 12) return null;
  if (year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Verifica se, 40 caracteres antes do índice, há rótulo de data-ruído. */
function nearNoiseLabel(low: string, index: number): boolean {
  const before = low.slice(Math.max(0, index - 40), index);
  return NOISE_LABELS.some((w) => before.includes(w));
}

/** 0) Linha explícita emitida pelo OCR: "COMPETENCIA: MM/AAAA". */
function fromExplicitLine(low: string): string | null {
  const m = low.match(/competencia\s*[:\-]\s*(0?[1-9]|1[0-2])\s*[\/\-.]\s*(20\d{2})/);
  if (m) return ym(Number(m[1]), Number(m[2]));
  const m2 = low.match(
    new RegExp(`competencia\\s*[:\\-]\\s*(${Object.keys(MESES_MAP).join("|")})\\w*\\s*(?:de\\s*)?(20\\d{2})`),
  );
  if (m2) return ym(MESES_MAP[m2[1]], Number(m2[2]));
  return null;
}

/** 1) Intervalo "DD/MM/AAAA a|à|até|- DD/MM/AAAA" (período de referência). */
function fromDateRange(low: string): string | null {
  const re =
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\s*(?:a|à|ate|até|-|—|a\s+)\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/;
  const m = low.match(re);
  if (!m) return null;
  const m1 = Number(m[2]);
  const y1 = Number(m[3]);
  const m2 = Number(m[5]);
  const y2 = Number(m[6]);
  if (m1 === m2 && y1 === y2) return ym(m1, y1);
  return ym(m1, y1);
}

/** 2) Rótulo + MM/AAAA. */
function fromLabeledNumeric(low: string): string | null {
  const re =
    /(?:competencia|comp\.?|referencia|referente(?:\s+a)?|periodo|folha\s+mensal|mes|decimo\s+terceiro|13o?º?)[^\d]{0,25}(0?[1-9]|1[0-2])[\/\-.](20\d{2})/;
  const m = low.match(re);
  if (!m) return null;
  return ym(Number(m[1]), Number(m[2]));
}

/** 3) Nome do mês + ano ("Junho de 2026", "JUNHO/2026"). */
function fromMonthName(low: string): string | null {
  const re = new RegExp(`\\b(${Object.keys(MESES_MAP).join("|")})\\b[^\\d]{0,25}(20\\d{2})`);
  const m = low.match(re);
  if (!m) return null;
  return ym(MESES_MAP[m[1]], Number(m[2]));
}

/** 4) MM/AAAA solto — ignora o que faz parte de DD/MM/AAAA e datas rotuladas como ruído. */
function fromLooseNumeric(low: string): string | null {
  const re = /(\d{1,2}[\/\-.])?\b(0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/g;
  for (const m of low.matchAll(re)) {
    if (m[1]) continue; // é parte de uma data completa DD/MM/AAAA
    if (nearNoiseLabel(low, m.index ?? 0)) continue;
    const v = ym(Number(m[2]), Number(m[3]));
    if (v) return v;
  }
  return null;
}

/** 5) Desempate por frequência das datas de linha ("01/06", "02/06", …). */
function fromDayFrequency(low: string): string | null {
  const counts = new Map<string, number>();
  // datas completas DD/MM/AAAA
  for (const m of low.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/g)) {
    if (nearNoiseLabel(low, m.index ?? 0)) continue;
    const key = ym(Number(m[2]), Number(m[3]));
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // datas curtas DD/MM (sem ano) — usa o ano dominante já encontrado
  if (counts.size > 0) {
    const dominantYear = [...counts.keys()][0].slice(0, 4);
    for (const m of low.matchAll(/\b([0-2]\d|3[01])[\/\-.](0[1-9]|1[0-2])\b(?![\/\-.]\d)/g)) {
      const key = ym(Number(m[2]), Number(dominantYear));
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  return bestCount >= 3 ? best : null;
}

/**
 * Retorna a competência do documento no formato "YYYY-MM", ou null.
 * A ordem de prioridade evita confundir datas de admissão/emissão com a competência.
 */
export function extractPeriodo(text: string): string | null {
  if (!text) return null;
  const low = deaccentLower(text);
  return (
    fromExplicitLine(low) ??
    fromDateRange(low) ??
    fromLabeledNumeric(low) ??
    fromMonthName(low) ??
    fromDayFrequency(low) ??
    fromLooseNumeric(low)
  );
}

/** Tenta extrair "YYYY-MM" do nome do arquivo (ex.: "Recibo 06.2026.pdf"). */
export function extractPeriodoFromFilename(name: string): string | null {
  if (!name) return null;
  const low = deaccentLower(name);
  return fromLabeledNumeric(low) ?? fromMonthName(low) ?? fromLooseNumeric(low);
}
