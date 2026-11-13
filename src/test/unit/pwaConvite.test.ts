import { describe, expect, it } from "vitest";
import {
  conviteDispensadoRecente,
  deveMostrarConvite,
  lerDispensaConvite,
  tecladoAberto,
} from "@/lib/pwa/convite";

const DIA = 24 * 60 * 60 * 1000;
const agora = Date.UTC(2026, 10, 13, 20, 0, 0);
const base = { oferecer: true, dispensadoRecente: false, cookiesRespondidos: true, teclado: false, atrasoConcluido: true };

describe("balão de baixar o app no portal", () => {
  it("fechado há 13 dias continua escondido", () => {
    expect(conviteDispensadoRecente(agora - 13 * DIA, agora)).toBe(true);
  });

  it("fechado há 14 dias volta a aparecer", () => {
    expect(conviteDispensadoRecente(agora - 14 * DIA, agora)).toBe(false);
  });

  it("quem fechou na versão antiga (marca '1') conta como fechado agora", () => {
    const r = lerDispensaConvite("1", agora);
    expect(r).toEqual({ dispensadoEm: agora, migrar: true });
    expect(conviteDispensadoRecente(r.dispensadoEm, agora)).toBe(true);
  });

  it("não aparece com o app instalado (ou no computador)", () => {
    expect(deveMostrarConvite({ ...base, oferecer: false })).toBe(false);
  });

  it("não aparece enquanto a caixa de cookies não foi respondida", () => {
    expect(deveMostrarConvite({ ...base, cookiesRespondidos: false })).toBe(false);
  });

  it("não aparece com o teclado aberto", () => {
    expect(tecladoAberto(740, 420)).toBe(true);
    expect(tecladoAberto(740, 700)).toBe(false);
    expect(deveMostrarConvite({ ...base, teclado: true })).toBe(false);
  });

  it("espera a página abrir antes de aparecer", () => {
    expect(deveMostrarConvite({ ...base, atrasoConcluido: false })).toBe(false);
    expect(deveMostrarConvite(base)).toBe(true);
  });
});
