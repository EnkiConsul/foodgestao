import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hojeISO, validarDataPagamento } from "@/lib/dp/comprovante-data";

describe("data do pagamento do comprovante", () => {
  it("aceita vazio (campo opcional)", () => {
    const r = validarDataPagamento("", "2026-09-22");
    expect(r.ok).toBe(true);
    expect(r.valor).toBeNull();
  });

  it("aceita hoje e datas passadas", () => {
    expect(validarDataPagamento("2026-09-22", "2026-09-22")).toEqual({ ok: true, valor: "2026-09-22" });
    expect(validarDataPagamento("2026-09-17", "2026-09-22").ok).toBe(true);
  });

  it("recusa data futura", () => {
    const r = validarDataPagamento("2026-09-23", "2026-09-22");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/futura/i);
  });

  it("recusa texto que não é data", () => {
    expect(validarDataPagamento("22/09/2026", "2026-09-22").ok).toBe(false);
  });

  it("hojeISO devolve AAAA-MM-DD", () => {
    expect(hojeISO(new Date(2026, 8, 22, 23, 30))).toBe("2026-09-22");
  });
});

describe("detalhes do documento", () => {
  it("consulta a coluna real de documento substituído", () => {
    const src = readFileSync("src/components/dp/documentos/DocDetalhesDialog.tsx", "utf8");
    expect(src).toContain("replaced_by_documento_id");
    expect(src).not.toContain("replaces_by_documento_id");
  });
});
