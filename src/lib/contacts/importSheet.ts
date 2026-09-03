/**
 * Leitura de planilhas (.xlsx/.xls/.csv) de clientes e fornecedores.
 *
 * O arquivo é lido inteiramente no navegador; nada é enviado ao servidor antes
 * da revisão do usuário. Cabeçalhos são reconhecidos por nome normalizado
 * (sem acentos, sem caixa, sem separadores).
 */
import { isValidCpf, maskCpfCnpj } from "@/lib/cpf";
import { isValidCnpj } from "@/lib/cnpj";
import { normalizeDocumento } from "@/lib/documento";

export type ContactImportType = "cliente" | "fornecedor" | "ambos";

export interface ContactImportRow {
  /** Número da linha na planilha (1-based, incluindo cabeçalho). */
  rowNumber: number;
  name: string;
  contact_type: ContactImportType;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null
  errors: string[];
}

export const MAX_IMPORT_ROWS = 2000;

const FIELD_ALIASES: Record<string, keyof ContactImportRow | "contact_type"> = {
  nome: "name",
  nomerazaosocial: "name",
  razaosocial: "name",
  fornecedor: "name",
  cliente: "name",
  tipo: "contact_type",
  tipodecontato: "contact_type",
  tipocontato: "contact_type",
  cpfcnpj: "document",
  cnpjcpf: "document",
  documento: "document",
  cnpj: "document",
  cpf: "document",
  email: "email",
  "e-mail": "email",
  telefone: "phone",
  celular: "phone",
  fone: "phone",
  whatsapp: "phone",
  endereco: "address",
  enderecocompleto: "address",
  observacoes: "notes",
  observacao: "notes",
  obs: "notes",
  anotacoes: "notes",
};

export function normalizeHeader(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

export function parseContactType(value: unknown): ContactImportType {
  const v = normalizeHeader(String(value ?? ""));
  if (v.startsWith("cliente")) return "cliente";
  if (v.startsWith("ambos") || v.startsWith("clientefornecedor")) return "ambos";
  return "fornecedor";
}

function cell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const anyv = value as Record<string, unknown>;
    if (typeof anyv.text === "string") return anyv.text.trim();
    if (typeof anyv.result === "string") return anyv.result.trim();
    if (Array.isArray((anyv as { richText?: unknown[] }).richText)) {
      return (anyv as { richText: { text?: string }[] }).richText.map((r) => r.text ?? "").join("").trim();
    }
    if (typeof anyv.hyperlink === "string") return String(anyv.hyperlink).trim();
  }
  return String(value).trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Monta a linha revisável a partir dos valores brutos já mapeados por campo. */
export function buildImportRow(raw: Record<string, string>, rowNumber: number): ContactImportRow {
  const errors: string[] = [];
  const name = (raw.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) errors.push("Nome é obrigatório");
  if (name.length > 100) errors.push("Nome acima de 100 caracteres");

  const email = (raw.email ?? "").trim() || null;
  if (email && !EMAIL_RE.test(email)) errors.push("E-mail inválido");

  const docDigits = normalizeDocumento(raw.document ?? "");
  let document: string | null = null;
  if (docDigits) {
    if (docDigits.length === 11 && isValidCpf(docDigits)) document = maskCpfCnpj(docDigits);
    else if (docDigits.length === 14 && isValidCnpj(docDigits)) document = maskCpfCnpj(docDigits);
    else errors.push("CPF/CNPJ inválido");
  }

  return {
    rowNumber,
    name,
    contact_type: parseContactType(raw.contact_type),
    document,
    email,
    phone: (raw.phone ?? "").trim().slice(0, 20) || null,
    address: (raw.address ?? "").trim().slice(0, 200) || null,
    notes: (raw.notes ?? "").trim().slice(0, 500) || null,
    errors,
  };
}

/** Converte matriz de células (primeira linha = cabeçalho) em linhas revisáveis. */
export function rowsFromMatrix(matrix: string[][]): ContactImportRow[] {
  const headerIndex = matrix.findIndex((r) => r.some((c) => FIELD_ALIASES[normalizeHeader(c)]));
  if (headerIndex < 0) {
    throw new Error(
      "Não encontramos as colunas esperadas. Baixe o modelo e mantenha os cabeçalhos (nome, tipo, cpf_cnpj, email, telefone).",
    );
  }
  const header = matrix[headerIndex].map((c) => FIELD_ALIASES[normalizeHeader(c)] ?? null);

  const rows: ContactImportRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    if (!line.some((c) => c && c.trim())) continue;
    const raw: Record<string, string> = {};
    header.forEach((field, col) => {
      if (!field) return;
      const value = (line[col] ?? "").trim();
      if (value && !raw[field]) raw[field] = value;
    });
    rows.push(buildImportRow(raw, i + 1));
    if (rows.length >= MAX_IMPORT_ROWS) break;
  }
  return rows;
}

/** Parser CSV simples com suporte a aspas e separador , ou ; */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n")[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === sep) { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); out.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) out.push(row);
  return out;
}

/** Lê o arquivo escolhido pelo usuário e devolve as linhas revisáveis. */
export async function parseContactsSheet(file: File): Promise<ContactImportRow[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return rowsFromMatrix(parseCsv(await file.text()));
  }

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A planilha está vazia.");

  const matrix: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const line: string[] = [];
    r.eachCell({ includeEmpty: true }, (c, col) => {
      line[col - 1] = cell(c.value);
    });
    matrix.push(Array.from(line, (v) => v ?? ""));
  });
  return rowsFromMatrix(matrix);
}
