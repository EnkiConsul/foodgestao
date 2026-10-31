import { describe, it, expect } from "vitest";
import { revogacaoPendente, respostaRevogacaoPendente } from "@/lib/pluggy/revogacao";

describe("revogação Pluggy", () => {
  it("status que começa com failed é pendente", () => {
    expect(revogacaoPendente("failed: delete_item_failed: 500")).toBe(true);
  });
  it("status ok não é pendente", () => {
    expect(revogacaoPendente("ok")).toBe(false);
    expect(revogacaoPendente(null)).toBe(false);
  });
  it("resposta 202 com revocation_pending não é sucesso", () => {
    expect(respostaRevogacaoPendente({ ok: false, revocation_pending: true })).toBe(true);
    expect(respostaRevogacaoPendente({ ok: true, revocation_pending: false })).toBe(false);
  });
});
