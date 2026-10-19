import { describe, expect, it } from "vitest";
import { approvalFullySaved, importSessionComplete } from "./importSessionComplete";

describe("conclusão da janela de importação", () => {
  it("não fecha após apenas enviar ou processar o PDF", () => {
    for (const status of ["queued", "processing", "ready", "partially_imported", "failed"]) {
      expect(importSessionComplete(["pdf-a"], [{ id: "pdf-a", status }])).toBe(false);
    }
  });
  it("fecha depois de salvar o documento", () => {
    expect(importSessionComplete(["pdf-a"], [{ id: "pdf-a", status: "imported" }])).toBe(true);
  });
  it("aguarda todos os PDFs enviados na janela", () => {
    expect(importSessionComplete(["pdf-a", "pdf-b"], [
      { id: "pdf-a", status: "imported" }, { id: "pdf-b", status: "ready" },
    ])).toBe(false);
    expect(importSessionComplete(["pdf-a", "pdf-b"], [
      { id: "pdf-a", status: "imported" }, { id: "pdf-b", status: "imported" },
    ])).toBe(true);
  });
  it("não fecha uma sessão vazia nem usa outro lote como conclusão", () => {
    expect(importSessionComplete([], [])).toBe(false);
    expect(importSessionComplete(["pdf-a"], [{ id: "outro-pdf", status: "imported" }])).toBe(false);
  });
  it("mantém a revisão aberta se alguma página falhar ou não devolver resultado", () => {
    expect(approvalFullySaved(2, [{ ok: true }, { ok: false }])).toBe(false);
    expect(approvalFullySaved(2, [{ ok: true }])).toBe(false);
    expect(approvalFullySaved(0, [])).toBe(false);
  });
  it("confirma aprovação completa somente com todas as páginas salvas", () => {
    expect(approvalFullySaved(2, [{ ok: true }, { ok: true }])).toBe(true);
  });
});