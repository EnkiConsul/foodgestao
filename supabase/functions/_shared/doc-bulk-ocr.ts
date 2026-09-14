// supabase/functions/_shared/doc-bulk-ocr.ts
// Reconhecimento (OCR/IA) e casamento de páginas do lote de documentos do DP.
//
// As REGRAS de reconhecimento/classificação são as mesmas usadas antes pela
// função dp-doc-bulk-ingest: este módulo apenas as isola para que o worker
// durável (dp-doc-bulk-worker) as reutilize sem alteração de comportamento.
//
// Acréscimos da fila durável: tempo limite explícito na chamada de IA e
// classificação de erro em transitório (retry) x definitivo (estado final).

import { extractPeriodo, extractPeriodoFromFilename } from "./competencia.ts";
import {
  assinaturaDocumento,
  detectarAssinatura,
  detectTipoFromText,
  DOC_TIPO_EXIGE_ACEITE,
  parseNaturezaLine,
  type DocTipo,
} from "./doc-tipos.ts";
import { tipoCanonicoPorVinculo } from "./doc-tipo-vinculo.ts";
import { extrairCpfValido, extrairNomePessoa, isCpfValido } from "./doc-pessoa.ts";

export const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const OCR_MODEL = "google/gemini-2.5-flash";
export const OCR_TIMEOUT_MS = 60_000;

export type Colab = {
  id: string;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  ativo: boolean;
  unidade_id: string | null;
  possui_folha_ponto: boolean | null;
  vinculo_label: string | null;
  socio_remuneracao: string | null;
};

export type ErrorClass = "transient" | "fatal";

/** Erro de reconhecimento já classificado para a política de retry. */
export class OcrError extends Error {
  readonly errorClass: ErrorClass;
  constructor(message: string, errorClass: ErrorClass) {
    super(message);
    this.name = "OcrError";
    this.errorClass = errorClass;
  }
}

/**
 * Classificação padrão de falhas.
 * Transitório: tempo esgotado, 429, 5xx, rede/indisponibilidade.
 * Definitivo: arquivo/formato inválido, requisição rejeitada, resposta vazia.
 */
export function classifyError(e: unknown): ErrorClass {
  if (e instanceof OcrError) return e.errorClass;
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (
    msg.includes("timeout") || msg.includes("abort") || msg.includes("429") ||
    msg.includes("rate limit") || msg.includes("unavailable") ||
    msg.includes("indispon") || /\b5\d\d\b/.test(msg) ||
    msg.includes("network") || msg.includes("fetch failed") ||
    msg.includes("connection")
  ) {
    return "transient";
  }
  if (
    msg.includes("invalid pdf") || msg.includes("pdf inv") ||
    msg.includes("encrypted") || msg.includes("unsupported") ||
    msg.includes("formato") || msg.includes("400") || msg.includes("402") ||
    msg.includes("403")
  ) {
    return "fatal";
  }
  return "transient";
}

export const OCR_PROMPT =
  "Extraia TODO o texto legível deste documento de departamento pessoal. Responda apenas com o texto puro extraído, sem comentários. Inclua CPF, CNPJ, matrícula e nome do colaborador. Acrescente uma linha exatamente `PESSOA: <nome completo da pessoa a que o documento se refere>` — use SEMPRE o nome que aparece no campo/rótulo do funcionário, colaborador, empregado ou sócio (que pode estar na linha ABAIXO do rótulo), NUNCA a razão social/nome fantasia da empresa do cabeçalho nem nomes com LTDA, ME, MEI, EIRELI, EPP, S/A, COMÉRCIO, ALIMENTOS, RESTAURANTE ou similares; em caso de dúvida escreva `PESSOA: DESCONHECIDO` e outra linha exatamente `CPF_PESSOA: <apenas o CPF dessa pessoa>` — use somente um número rotulado como CPF; NUNCA use PIS, PASEP, NIT, matrícula INSS, RG, CTPS ou código interno; se o documento não informar o CPF, escreva `CPF_PESSOA: DESCONHECIDO`. Na ANTEPENÚLTIMA linha, acrescente exatamente `COMPETENCIA: MM/AAAA` com o mês/ano de referência do documento (o período trabalhado ou a folha a que ele se refere). NUNCA use a data de emissão, impressão, admissão ou pagamento como competência. Se não for possível determinar, escreva `COMPETENCIA: DESCONHECIDA`. Na PENÚLTIMA linha, acrescente exatamente `NATUREZA: x` onde x é UM destes valores, conforme o documento: contracheque (contracheque/holerite mensal), contracheque_13 (décimo terceiro), contracheque_ferias (folha de pagamento de férias), adiantamento (adiantamento/antecipação salarial), ponto (folha/espelho de ponto), aviso_ferias, recibo_ferias, informe_rendimentos (comprovante anual de rendimentos), atestado, disciplinar (advertência/suspensão), contrato, outros. Se não tiver certeza, escreva `NATUREZA: outros`. Na ÚLTIMA linha, acrescente exatamente `ASSINADO: SIM` se o documento JÁ contiver a assinatura do colaborador (rubrica manuscrita sobre a linha de assinatura, campo de assinatura preenchido, carimbo/selo de assinatura eletrônica como ICP-Brasil, Gov.br, DocuSign, Clicksign), ou `ASSINADO: NAO` se a linha de assinatura estiver em branco ou não houver assinatura do colaborador.";

/** Chamada de OCR com tempo limite explícito e erro já classificado. */
export async function ocrPage(
  apiKey: string,
  pdfB64: string,
  timeoutMs = OCR_TIMEOUT_MS,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(AI_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            {
              type: "file",
              file: { filename: "page.pdf", file_data: `data:application/pdf;base64,${pdfB64}` },
            },
          ],
        }],
      }),
    });
    if (!r.ok) {
      // Corpo da resposta não é registrado: pode conter dados do documento.
      const cls: ErrorClass = r.status === 429 || r.status >= 500 ? "transient" : "fatal";
      throw new OcrError(`ocr_http_${r.status}`, cls);
    }
    const j = await r.json();
    const text = String(j?.choices?.[0]?.message?.content ?? "");
    if (!text.trim()) throw new OcrError("ocr_resposta_vazia", "fatal");
    return text;
  } catch (e) {
    if (e instanceof OcrError) throw e;
    if ((e as Error)?.name === "AbortError") throw new OcrError("ocr_timeout", "transient");
    throw new OcrError(`ocr_falha: ${(e as Error).message}`.slice(0, 200), classifyError(e));
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Extrações e casamento (regras preservadas) ----------

export function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }

function normalizeName(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractCPFs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g)) {
    const d = onlyDigits(m[1]);
    if (d.length === 11) out.add(d);
  }
  return [...out];
}

export function extractCNPJs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/g)) {
    const d = onlyDigits(m[1]);
    if (d.length === 14) out.add(d);
  }
  return [...out];
}

export function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export type BatchCtx = {
  tipo: string;
  source_file_name: string | null;
  referencia_data: string | null;
  deteccao_automatica: boolean;
  exigir_aceite: boolean;
};

export type MatchDeps = {
  colabList: Colab[];
  cpfMap: Map<string, Colab>;
  cnpjToUnidade: Map<string, string>;
  /** Regra de natureza aprendida pela empresa para esta assinatura. */
  tipoAprendido: DocTipo | null;
  /** Documento já existente para colaborador+tipo+competência. */
  buscarDuplicado: (colaboradorId: string, tipo: string, ref: string) => Promise<string | null>;
};

export type ItemPayload = Record<string, unknown> & { assinatura: string | null };

/** Deriva o resultado da página (mesma lógica anterior de matching/classificação). */
export async function montarPayloadItem(
  ocr: string,
  batch: BatchCtx,
  deps: MatchDeps,
): Promise<ItemPayload> {
  const { colabList, cpfMap, cnpjToUnidade, tipoAprendido } = deps;

  const cpfs = extractCPFs(ocr).filter((c) => isCpfValido(c));
  const cpfPessoa = extrairCpfValido(ocr);
  const nomePessoa = extrairNomePessoa(ocr);
  const cnpjs = extractCNPJs(ocr);
  const competencia =
    extractPeriodo(ocr) ?? extractPeriodoFromFilename(batch.source_file_name ?? "");
  const unidadePorCnpj = cnpjs.map((c) => cnpjToUnidade.get(c)).find(Boolean) ?? null;

  const assinatura = assinaturaDocumento(batch.source_file_name ?? "", ocr);
  const tipoIa: DocTipo | null = parseNaturezaLine(ocr);
  const tipoHeuristica: DocTipo | null =
    detectTipoFromText(ocr) ?? detectTipoFromText(batch.source_file_name ?? "");
  const tipoDetectado: DocTipo | null = tipoAprendido ?? tipoIa ?? tipoHeuristica;
  const tipoOrigem = tipoAprendido ? "aprendido" : tipoIa ? "ia" : tipoHeuristica ? "keyword" : null;
  const tipoEfetivo = batch.deteccao_automatica ? (tipoDetectado ?? "outros") : batch.tipo;

  const restrictPonto = tipoEfetivo === "ponto";
  const candidates = colabList.filter((c) => {
    if (restrictPonto && c.possui_folha_ponto === false) return false;
    if (unidadePorCnpj && c.unidade_id && c.unidade_id !== unidadePorCnpj) return false;
    return true;
  });
  const candCpf = new Map<string, Colab>();
  for (const c of candidates) if (c.cpf) candCpf.set(onlyDigits(c.cpf), c);

  let match: Colab | undefined;
  let confidence = 0;
  let matchedCpf: string | null = null;
  let matchedNome: string | null = null;

  for (const cpf of cpfs) {
    const c = candCpf.get(cpf);
    if (c) { match = c; confidence = 0.95; matchedCpf = cpf; break; }
  }
  if (!match) {
    for (const cpf of cpfs) {
      const c = cpfMap.get(cpf);
      if (c) { match = c; confidence = 0.9; matchedCpf = cpf; break; }
    }
  }

  const unidadeDetectada = unidadePorCnpj ?? match?.unidade_id ?? null;

  if (!match) {
    const upper = normalizeName(ocr);
    for (const c of candidates) {
      if (!c.nome) continue;
      const nome = normalizeName(c.nome);
      if (nome.length < 8) continue;
      const re = new RegExp(`(^|[^A-Z])${escapeRegex(nome)}([^A-Z]|$)`);
      if (re.test(upper)) { match = c; confidence = 0.75; matchedNome = c.nome; break; }
    }
  }

  const tipoFinal = tipoCanonicoPorVinculo(tipoEfetivo, match ?? null) as DocTipo;

  let duplicateOf: string | null = null;
  if (match && (competencia || batch.referencia_data)) {
    const ref = competencia ? `${competencia}-01` : String(batch.referencia_data);
    duplicateOf = await deps.buscarDuplicado(match.id, tipoFinal, ref);
  }

  const assin = detectarAssinatura(ocr);
  const exigeAceiteTipo = DOC_TIPO_EXIGE_ACEITE[tipoFinal] ?? false;
  const exigirLote = batch.exigir_aceite !== false;

  return {
    ocr_text: ocr.slice(0, 8000),
    matched_cpf: matchedCpf ?? cpfPessoa,
    matched_nome: matchedNome ?? nomePessoa,
    matched_colaborador_id: match?.id ?? null,
    matched_colaborador_ativo: match ? match.ativo : null,
    detected_cnpj: cnpjs[0] ?? null,
    detected_unidade_id: unidadeDetectada,
    detected_competencia: competencia,
    tipo_detectado: tipoFinal,
    tipo_confidence: tipoAprendido ? 1 : tipoDetectado ? 0.9 : 0,
    tipo_origem: tipoOrigem,
    tipo_assinatura: assinatura || null,
    assinatura_detectada: assin.detectada,
    assinatura_evidencia: assin.evidencia,
    exige_aceite: exigirLote && exigeAceiteTipo && !assin.detectada,
    duplicate_of: duplicateOf,
    confidence,
    assinatura: assinatura || null,
  };
}
