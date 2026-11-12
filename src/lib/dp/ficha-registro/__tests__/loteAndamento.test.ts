import { describe, expect, it } from "vitest";
import { envioParaAbrir, resumirEnvios, situacaoEnvio } from "../lote-andamento";

const linhas = [
  ...Array.from({ length: 12 }, () => ({ importacao_id: "rancho", status: "pendente" })),
  ...Array.from({ length: 35 }, () => ({ importacao_id: "rancho", status: "criado" })),
  { importacao_id: "teste", status: "criado" },
];

describe("envio que a tela abre primeiro", () => {
  it("abre o lote com fichas a conferir, mesmo havendo um envio mais novo já concluído", () => {
    const envios = [
      { id: "teste", status: "ready" },
      { id: "rancho", status: "ready" },
    ];
    expect(envioParaAbrir(envios, resumirEnvios(linhas))?.id).toBe("rancho");
  });

  it("um arquivo ainda em leitura conta como trabalho em andamento", () => {
    const envios = [{ id: "novo", status: "processing" }, { id: "rancho", status: "ready" }];
    expect(envioParaAbrir(envios, resumirEnvios(linhas))?.id).toBe("novo");
  });

  it("sem nada pendente, abre o envio mais recente", () => {
    const envios = [{ id: "teste", status: "ready" }, { id: "velho", status: "failed" }];
    expect(envioParaAbrir(envios, resumirEnvios(linhas))?.id).toBe("teste");
  });
});

describe("situação de cada envio", () => {
  it("diz quantas fichas aguardam conferência", () => {
    expect(situacaoEnvio({ id: "rancho", status: "ready" }, resumirEnvios(linhas).rancho)).toBe(
      "12 fichas aguardando conferência",
    );
  });

  it("ficha ignorada não conta como aguardando e aparece no resumo", () => {
    const r = resumirEnvios([
      { importacao_id: "a", status: "criado" },
      { importacao_id: "a", status: "ignorado" },
    ]).a;
    expect(r.pendentes).toBe(0);
    expect(situacaoEnvio({ id: "a", status: "ready" }, r)).toBe("1 já no cadastro · 1 ignorada");
  });
});
