import { describe, expect, it } from "vitest";
import { resumoRepasse } from "../organizacao-lote";

const em = "2026-11-11T03:55:00.000Z"; // 00:55 em Brasília

describe("resumoRepasse", () => {
  it("mostra WhatsApp com final do número e e-mail quando os dois saíram", () => {
    expect(resumoRepasse({ user_id: "u", em, fichas: 47, canais: {
      whatsapp: { enviado: true, final: "7653" }, email: { enviado: true },
    } })).toBe("11/11 às 00:55 · WhatsApp (•••• 7653) e e-mail");
  });

  it("mostra só o e-mail quando o WhatsApp falhou", () => {
    expect(resumoRepasse({ user_id: "u", em, fichas: 47, canais: {
      whatsapp: { enviado: false, erro: "x" }, email: { enviado: true },
    } })).toBe("11/11 às 00:55 · e-mail");
  });

  it("repasse antigo sem canais informa só o aviso do sistema", () => {
    expect(resumoRepasse({ user_id: "u", em, fichas: 47 })).toBe("11/11 às 00:55 · só no aviso do sistema");
  });

  it("sem repasse não mostra nada", () => {
    expect(resumoRepasse(null)).toBeNull();
  });
});
