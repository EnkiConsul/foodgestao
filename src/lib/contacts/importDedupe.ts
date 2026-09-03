/**
 * Classificação das linhas importadas contra os contatos já cadastrados e
 * contra a própria planilha, para evitar duplicidade de fornecedores/clientes.
 */
import { normalizeDocumento } from "@/lib/documento";
import type { ContactImportRow } from "./importSheet";

export type ImportStatus = "novo" | "existente" | "duplicado_planilha" | "erro";

export interface ExistingContact {
  id: string;
  name: string;
  document: string | null;
}

export interface ClassifiedImportRow extends ContactImportRow {
  status: ImportStatus;
  /** Nome do cadastro existente que gerou o bloqueio, quando houver. */
  matchName?: string | null;
}

export function normalizeContactName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function classifyImportRows(
  rows: ContactImportRow[],
  existing: ExistingContact[],
): ClassifiedImportRow[] {
  const byDoc = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of existing) {
    const doc = normalizeDocumento(c.document);
    if (doc) byDoc.set(doc, c.name);
    const name = normalizeContactName(c.name);
    if (name && !byName.has(name)) byName.set(name, c.name);
  }

  const seenDoc = new Set<string>();
  const seenName = new Set<string>();

  return rows.map((row) => {
    if (row.errors.length > 0) return { ...row, status: "erro" as ImportStatus, matchName: null };

    const doc = normalizeDocumento(row.document);
    const name = normalizeContactName(row.name);

    if (doc) {
      const hit = byDoc.get(doc);
      if (hit) return { ...row, status: "existente", matchName: hit };
      if (seenDoc.has(doc)) return { ...row, status: "duplicado_planilha", matchName: null };
      seenDoc.add(doc);
      seenName.add(name);
      return { ...row, status: "novo", matchName: null };
    }

    const hitName = byName.get(name);
    if (hitName) return { ...row, status: "existente", matchName: hitName };
    if (seenName.has(name)) return { ...row, status: "duplicado_planilha", matchName: null };
    seenName.add(name);
    return { ...row, status: "novo", matchName: null };
  });
}
