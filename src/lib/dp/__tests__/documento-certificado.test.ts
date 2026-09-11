import { describe, expect, it } from "vitest";
import { certificadoValidacaoHtml } from "../documento-certificado";

const dados = {
  empresa: "PAKERÊ BAR LTDA",
  colaborador: "MARIA DA SILVA",
  documentoTitulo: "Contracheque 08/2026",
  documentoTipo: "Contracheque",
  competencia: "08/2026",
  arquivo: "contracheque.pdf",
  aceitoEm: "2026-09-05T13:45:00.000Z",
  aprovadoPor: "Maria da Silva",
  ip: "191.10.20.30",
  dispositivo: "Mozilla/5.0 (Android 14)",
  conteudoHash: "abc123hash",
  registroId: "11111111-2222-3333-4444-555555555555",
};

describe("certificado de validação", () => {
  it("inclui todos os campos de comprovação", () => {
    const html = certificadoValidacaoHtml(dados);
    for (const v of [
      dados.empresa,
      dados.colaborador,
      dados.documentoTitulo,
      dados.competencia,
      dados.arquivo,
      dados.ip,
      dados.conteudoHash,
      dados.registroId,
    ]) {
      expect(html).toContain(v);
    }
    expect(html).toContain("Certificado de Validação de Documento");
    expect(html).toMatch(/05\/09\/2026/);
  });

  it("escapa conteúdo e tolera campos ausentes", () => {
    const html = certificadoValidacaoHtml({
      ...dados,
      colaborador: '<script>x</script>',
      ip: null,
      conteudoHash: null,
      competencia: null,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("—");
  });
});
