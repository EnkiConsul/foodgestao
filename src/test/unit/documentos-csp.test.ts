import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { escapeHtml } from "@/lib/print/imprimirHtml";
import { buildPrintableHtml } from "@/lib/relatorios/fluxoCaixaExport";
import {
  certificadoValidacaoHtml,
  type CertificadoValidacaoDados,
} from "@/lib/dp/documento-certificado";

/** Arquivos que geram HTML imprimível/documentos no navegador. */
const ARQUIVOS_DOCUMENTOS = [
  "src/lib/print/imprimirHtml.ts",
  "src/lib/relatorios/fluxoCaixaExport.ts",
  "src/lib/dp/ferias-programacao.ts",
  "src/lib/dp/documento-certificado.ts",
  "src/components/relatorios/contabeis/DreReport.tsx",
  "src/components/dp/BeneficioDispensaDialog.tsx",
  "src/components/dp/preadmissao/PreadmissaoRevisaoDialog.tsx",
];

const ler = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("CSP — documentos gerados não contêm executável inline", () => {
  it.each(ARQUIVOS_DOCUMENTOS)("%s não emite <script> nem handler inline", (arquivo) => {
    const src = ler(arquivo);
    // <script> embutido no HTML gerado (o JSON-LD do index.html não passa por aqui)
    expect(src).not.toMatch(/<script(?![^>]*type="application\/ld\+json")/i);
    // handlers inline em atributo (onclick=, onload=" dentro de string HTML)
    expect(src).not.toMatch(/\son(?:click|load|error|submit|change)\s*=\s*["']/i);
  });

  it("nenhuma exportação usa document.write nem pop-up para imprimir", () => {
    for (const arquivo of ARQUIVOS_DOCUMENTOS) {
      const src = ler(arquivo);
      expect(src).not.toContain("document.write");
      expect(src).not.toMatch(/window\.open\(\s*""/);
    }
  });
});

describe("Escape de valores do usuário no HTML impresso", () => {
  it("neutraliza tags, aspas e apóstrofos", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(escapeHtml("O'Brien & Cia")).toBe("O&#39;Brien &amp; Cia");
    expect(escapeHtml(null)).toBe("");
  });

  it("relatório imprimível escapa título, células e observações", () => {
    const html = buildPrintableHtml({
      title: `<script>alert(1)</script>`,
      subtitle: `"aspas"`,
      head: ["<b>Conta</b>"],
      body: [{ cells: [`<img onerror="x">`] }],
      notes: [`<svg onload="y">`],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toMatch(/onerror="x"/);
    expect(html).not.toMatch(/onload="y"/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("certificado de validação escapa todos os campos do registro", () => {
    const dados: CertificadoValidacaoDados = {
      empresa: `Empresa <b>Teste</b>`,
      colaborador: `<script>alert(1)</script>`,
      documentoTitulo: `Contracheque "maio"`,
      documentoTipo: `<i>contracheque</i>`,
      competencia: `05/2026 <span>`,
      arquivo: `arq<uivo>.pdf`,
      aceitoEm: new Date("2026-05-10T12:00:00Z").toISOString(),
      aprovadoPor: `<img onerror="z">`,
      ip: `10.0.0.1"><b>`,
      dispositivo: `<svg onload="w">`,
      conteudoHash: `abc123<hr>`,
      registroId: `id<">`,
    };
    const html = certificadoValidacaoHtml(dados);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toMatch(/onerror="z"/);
    expect(html).not.toMatch(/onload="w"/);
    expect(html).not.toContain("<b>Teste</b>");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<hr>");
    // conteúdo preservado em forma escapada
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Contracheque &quot;maio&quot;");
  });
});
