import { describe, expect, it } from "vitest";
import { linkWhatsapp, numeroWhatsapp } from "./whatsapp-despacho";

describe("envio WhatsApp", () => {
  it("normaliza número brasileiro com DDD e preserva DDI", () => {
    expect(numeroWhatsapp("(62) 99403-8088")).toBe("5562994038088");
    expect(numeroWhatsapp("+55 62 99403-8088")).toBe("5562994038088");
    expect(numeroWhatsapp("123")).toBeNull();
  });
  it("direciona para os pacotes distintos sem perder mensagem ou alternativa web", () => {
    const normal = linkWhatsapp("62994038088", "Olá! A & B", "normal");
    const business = linkWhatsapp("62994038088", "Olá! A & B", "business");
    expect(normal).toContain("package=com.whatsapp;");
    expect(business).toContain("package=com.whatsapp.w4b;");
    expect(business).toContain("text=Ol%C3%A1!%20A%20%26%20B");
    expect(business).toContain(`S.browser_fallback_url=${encodeURIComponent("https://wa.me/5562994038088?text=Ol%C3%A1!%20A%20%26%20B")}`);
  });
});