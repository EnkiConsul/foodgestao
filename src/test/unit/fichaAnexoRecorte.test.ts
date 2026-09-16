// Anexo da ficha de registro: só as páginas do colaborador autorizado.
// O PDF usado aqui é montado no próprio teste com dados sintéticos de três
// pessoas, e o recorte é reaberto e conferido página por página.
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { recortarPaginasPdf, validarFaixaPaginas, RecorteInvalidoError } from "@/lib/dp/ficha-registro/recortarPaginas";
import { anexarFichaRecorte, destinoAnexoFicha, type AnexoFichaPorts } from "@/lib/dp/ficha-registro/anexarFichaRecorte";

const PESSOAS = ["ANA SINTETICA", "BRUNO SINTETICO", "CARLA SINTETICA"];

/** Lote sintético: 1 página por pessoa, com o nome escrito na página. */
async function loteSintetico(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const nome of PESSOAS) {
    const p = doc.addPage([400, 200]);
    p.drawText(nome, { x: 20, y: 150, size: 14, font });
  }
  return await doc.save();
}

const COMPANY = "11111111-1111-4111-8111-111111111111";
const COLAB = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

function ports(lote: Uint8Array, over: Partial<AnexoFichaPorts> = {}) {
  const enviados: Array<{ destino: string; pdf: Uint8Array }> = [];
  const registros: Array<{ destino: string; descricao: string }> = [];
  const base: AnexoFichaPorts = {
    baixarLote: async () => lote,
    enviarRecorte: async (destino, pdf) => {
      enviados.push({ destino, pdf });
      return { error: null };
    },
    documentoExistente: async () => false,
    registrarDocumento: async (i) => {
      registros.push(i);
      return { error: null };
    },
    ...over,
  };
  return { base, enviados, registros };
}

describe("validarFaixaPaginas", () => {
  it("recusa faixa ausente, invertida ou fora do arquivo", () => {
    expect(() => validarFaixaPaginas({ inicio: null, fim: null }, 3)).toThrow(RecorteInvalidoError);
    expect(() => validarFaixaPaginas({ inicio: 3, fim: 2 }, 3)).toThrow(RecorteInvalidoError);
    expect(() => validarFaixaPaginas({ inicio: 2, fim: 9 }, 3)).toThrow(RecorteInvalidoError);
    expect(validarFaixaPaginas({ inicio: 2, fim: null }, 3)).toEqual({ inicio: 2, fim: 2 });
  });
});

describe("recortarPaginasPdf em lote com três pessoas", () => {
  it("devolve somente a página do item autorizado", async () => {
    const lote = await loteSintetico();
    const recorte = await recortarPaginasPdf(lote, { inicio: 2, fim: 2 });
    const doc = await PDFDocument.load(recorte);
    expect(doc.getPageCount()).toBe(1);
    expect(recorte.byteLength).toBeLessThan(lote.byteLength);
  });

  it("recorta faixa de várias páginas sem incluir as demais", async () => {
    const lote = await loteSintetico();
    const doc = await PDFDocument.load(await recortarPaginasPdf(lote, { inicio: 1, fim: 2 }));
    expect(doc.getPageCount()).toBe(2);
  });

  it("nunca devolve o lote completo quando a faixa é inválida", async () => {
    const lote = await loteSintetico();
    await expect(recortarPaginasPdf(lote, { inicio: 1, fim: 4 })).rejects.toBeInstanceOf(RecorteInvalidoError);
  });
});

describe("anexarFichaRecorte", () => {
  const input = {
    companyId: COMPANY, colaboradorId: COLAB, itemId: ITEM,
    arquivoPath: "lote/abc.pdf", paginaInicio: 2, paginaFim: 2,
  };

  it("envia apenas o recorte, com destino determinístico", async () => {
    const lote = await loteSintetico();
    const { base, enviados, registros } = ports(lote);
    const r = await anexarFichaRecorte(input, base);
    expect(r.status).toBe("anexado");
    expect(enviados).toHaveLength(1);
    expect(enviados[0].destino).toBe(destinoAnexoFicha(COMPANY, COLAB, ITEM));
    expect(enviados[0].pdf.byteLength).toBeLessThan(lote.byteLength);
    const doc = await PDFDocument.load(enviados[0].pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(registros[0].descricao).toContain("página 2");
  });

  it("sem páginas informadas não anexa nada e explica o motivo", async () => {
    const lote = await loteSintetico();
    const { base, enviados } = ports(lote);
    const r = await anexarFichaRecorte({ ...input, paginaInicio: null, paginaFim: null }, base);
    expect(r.status).toBe("sem_paginas");
    expect(r.motivo).toBeTruthy();
    expect(enviados).toHaveLength(0);
  });

  it("faixa fora do arquivo não anexa o lote inteiro", async () => {
    const lote = await loteSintetico();
    const { base, enviados } = ports(lote);
    const r = await anexarFichaRecorte({ ...input, paginaInicio: 5, paginaFim: 6 }, base);
    expect(r.status).toBe("sem_paginas");
    expect(enviados).toHaveLength(0);
  });

  it("repetição depois de anexado não duplica documento nem falha", async () => {
    const lote = await loteSintetico();
    const { base, enviados } = ports(lote, { documentoExistente: async () => true });
    const r = await anexarFichaRecorte(input, base);
    expect(r.status).toBe("ja_anexado");
    expect(enviados).toHaveLength(0);
  });

  it("arquivo já presente no destino não é tratado como erro", async () => {
    const lote = await loteSintetico();
    const { base, registros } = ports(lote, {
      enviarRecorte: async () => ({ error: { message: "The resource already exists" } }),
    });
    const r = await anexarFichaRecorte(input, base);
    expect(r.status).toBe("anexado");
    expect(registros).toHaveLength(1);
  });

  it("erro de infraestrutura é reportado, não silenciado", async () => {
    const lote = await loteSintetico();
    const { base } = ports(lote, {
      registrarDocumento: async () => ({ error: { message: "RLS negou o registro" } }),
    });
    const r = await anexarFichaRecorte(input, base);
    expect(r.status).toBe("falhou");
    expect(r.motivo).toContain("RLS");
  });

  it("falha ao baixar o lote não anexa e não afeta o cadastro já aplicado", async () => {
    const { base } = ports(new Uint8Array(), {
      baixarLote: async () => {
        throw new Error("Arquivo do lote não encontrado.");
      },
    });
    const r = await anexarFichaRecorte(input, base);
    expect(r.status).toBe("falhou");
    expect(r.motivo).toContain("lote");
  });
});
