import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  avisoCompetenciaDivergente,
  competenciaDivergente,
  competenciaParaAnoMes,
  extrairDataDoTexto,
  sugerirDataPagamento,
} from "@/lib/dp/comprovante-data";

describe("competência do comprovante", () => {
  it("lê a competência MM/AAAA", () => {
    expect(competenciaParaAnoMes("09/2026")).toBe("2026-09");
    expect(competenciaParaAnoMes("—")).toBeNull();
    expect(competenciaParaAnoMes("13/2026")).toBeNull();
  });

  it("aponta divergência quando o pagamento é de outro mês", () => {
    expect(competenciaDivergente("2026-09-15", "08/2026")).toBe(true);
    expect(competenciaDivergente("2026-09-15", "09/2026")).toBe(false);
  });

  it("não aponta divergência sem data ou sem competência", () => {
    expect(competenciaDivergente("", "08/2026")).toBe(false);
    expect(competenciaDivergente("2026-09-15", null)).toBe(false);
  });

  it("explica a divergência em linguagem de negócio", () => {
    const frase = avisoCompetenciaDivergente("2026-09-15", "08/2026");
    expect(frase).toContain("09/2026");
    expect(frase).toContain("08/2026");
  });
});

describe("data lida do comprovante", () => {
  const hoje = "2026-09-22";

  it("lê data no formato brasileiro", () => {
    expect(extrairDataDoTexto("Pix realizado em 15/09/2026 às 10h", hoje)).toBe("2026-09-15");
  });

  it("lê data no formato do sistema e compacto", () => {
    expect(extrairDataDoTexto("data 2026-09-15", hoje)).toBe("2026-09-15");
    expect(extrairDataDoTexto("IMG-20260915-WA0020.jpg", hoje)).toBe("2026-09-15");
  });

  it("lê data escrita com o mês por extenso", () => {
    expect(extrairDataDoTexto("15 de setembro de 2026", hoje)).toBe("2026-09-15");
  });

  it("ignora data futura e data impossível", () => {
    expect(extrairDataDoTexto("30/09/2026", hoje)).toBeNull();
    expect(extrairDataDoTexto("31/02/2026", hoje)).toBeNull();
  });

  it("devolve vazio quando não há data legível", () => {
    expect(extrairDataDoTexto("comprovante sem data", hoje)).toBeNull();
  });

  it("sugere a data lida do conteúdo do arquivo", async () => {
    const file = new File(["Pagamento efetuado em 17/09/2026"], "recibo.pdf", {
      type: "application/pdf",
    });
    await expect(sugerirDataPagamento(file, hoje)).resolves.toEqual({
      valor: "2026-09-17",
      origem: "arquivo",
    });
  });

  it("cai para o nome do arquivo quando o conteúdo não tem data", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "IMG-20260915-WA0020.jpg", {
      type: "image/jpeg",
    });
    await expect(sugerirDataPagamento(file, hoje)).resolves.toEqual({
      valor: "2026-09-15",
      origem: "nome",
    });
  });
});

describe("telas e servidor do comprovante", () => {
  it("o formulário pede confirmação da competência divergente", () => {
    const src = readFileSync("src/components/dp/documentos/ComprovantePagamentoPanel.tsx", "utf8");
    expect(src).toContain("competenciaDivergente");
    expect(src).toContain("confirmarCompetencia");
    expect(src).toContain("Data lida do comprovante");
  });

  it("a rotina oficial envia a confirmação para o servidor", () => {
    const src = readFileSync("src/lib/dp/documentos-oficial.ts", "utf8");
    expect(src).toContain("p_confirmar_competencia");
    expect(src).toContain("DOC_COMPROVANTE_COMPETENCIA_DIVERGENTE");
  });

  it("o certificado mostra a competência do documento no anexo", () => {
    const src = readFileSync("supabase/functions/dp-documento-certificado/index.ts", "utf8");
    expect(src).toContain("Competência do documento:");
  });
});
