import { describe, expect, it } from "vitest";
import { envioRecolhidoAoAbrir, lotesAbertos, situacaoLoteAberto } from "../lotes-abertos";

const agora = new Date("2026-11-12T03:00:00Z");
const lote = (id: string, status: string, created_at: string, tipo = "contracheque") => ({ id, status, created_at, tipo });

describe("lotes de documentos aguardando conferência", () => {
  it("mostra lote lido com páginas pendentes e lote em leitura; esconde concluído e sem pendência", () => {
    const r = lotesAbertos(
      [
        lote("pronto", "ready", "2026-11-10T10:00:00Z"),
        lote("lendo", "processing", "2026-11-11T10:00:00Z"),
        lote("importado", "imported", "2026-11-11T09:00:00Z"),
        lote("parcialSemPend", "partially_imported", "2026-11-09T09:00:00Z"),
      ],
      { pronto: 41, parcialSemPend: 0 },
      agora,
    );
    expect(r.map((l) => l.id)).toEqual(["lendo", "pronto"]);
  });

  it("lote com mais de 60 dias não fica cobrando no topo", () => {
    expect(lotesAbertos([lote("julho", "partially_imported", "2026-07-23T10:00:00Z")], { julho: 2 }, agora)).toEqual([]);
  });

  it("envio começa recolhido quando já há lote aberto do mesmo tipo pedido", () => {
    const abertos = [lote("a", "ready", "2026-11-10T10:00:00Z", "ponto")];
    expect(envioRecolhidoAoAbrir(abertos, null)).toBe(true);
    expect(envioRecolhidoAoAbrir(abertos, "ponto")).toBe(true);
    expect(envioRecolhidoAoAbrir(abertos, "contracheque")).toBe(false);
    expect(envioRecolhidoAoAbrir([], null)).toBe(false);
  });

  it("descreve páginas para conferir e leitura em andamento", () => {
    expect(situacaoLoteAberto({ ...lote("a", "ready", ""), total_pages: 41 }, 41)).toBe("41 páginas para conferir");
    expect(situacaoLoteAberto({ ...lote("a", "processing", ""), total_pages: 12, processed_pages: 3 }, 0)).toBe(
      "Lendo 3 de 12 páginas",
    );
  });
});
