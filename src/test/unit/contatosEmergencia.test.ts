import { describe, it, expect } from "vitest";
import { contatosValidos, confirmacaoVencida, contatosDaFicha } from "@/lib/dp/contatosEmergencia";

const ok = { nome: "MARIA SILVA", parentesco: "mae", whatsapp: "62999998888" };

describe("contatos de emergência", () => {
  it("exige ao menos 1 contato completo", () => {
    expect(contatosValidos([])).toBe(false);
    expect(contatosValidos([{ nome: "MARIA", parentesco: "", whatsapp: "62999998888" }])).toBe(false);
    expect(contatosValidos([ok])).toBe(true);
  });
  it("aceita no máximo 2", () => {
    expect(contatosValidos([ok, ok])).toBe(true);
    expect(contatosValidos([ok, ok, ok])).toBe(false);
  });
  it("vence após 180 dias", () => {
    const agora = new Date("2026-10-10T00:00:00Z");
    expect(confirmacaoVencida("2026-05-01T00:00:00Z", null, agora)).toBe(false);
    expect(confirmacaoVencida("2026-04-01T00:00:00Z", null, agora)).toBe(true);
    expect(confirmacaoVencida(null, null, agora)).toBe(true);
    expect(confirmacaoVencida("2026-10-01T00:00:00Z", "2026-10-05T00:00:00Z", agora)).toBe(true);
  });
  it("recado antigo vira o 1º contato", () => {
    const l = contatosDaFicha({ whatsapp_contato: "(62) 99999-1111 — Joana" });
    expect(l[0].whatsapp).toBe("62999991111");
    expect(l[0].parentesco).toBe("outro_familiar");
  });
});
