import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  CSP_FRAME_ANCESTORS,
  CSP_INLINE_SCRIPT_HASHES,
  cspFrameAncestorsHeaderValue,
  cspHeadersFase1,
  cspReportOnlyHeaderValue,
} from "@/lib/security/csp";
import { sanitizarViolacaoCsp } from "@/lib/security/cspViolationLogger";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

type BlocoInline = { tipo: string; conteudo: string };

function blocosInline(): BlocoInline[] {
  const out: BlocoInline[] = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    const tipo = /type\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? "text/javascript";
    out.push({ tipo, conteudo: m[2] });
  }
  return out;
}

describe("CSP — index.html sem script inline executável", () => {
  it("não reintroduz script inline executável", () => {
    const executaveis = blocosInline().filter((b) => !/ld\+json/i.test(b.tipo));
    expect(executaveis.map((b) => b.tipo)).toEqual([]);
  });

  it("lista de hashes cobre exatamente os inline executáveis existentes", () => {
    const hashes = blocosInline()
      .filter((b) => !/ld\+json/i.test(b.tipo))
      .map((b) => `sha256-${createHash("sha256").update(b.conteudo, "utf8").digest("base64")}`);
    expect(new Set(CSP_INLINE_SCRIPT_HASHES)).toEqual(new Set(hashes));
  });

  it("os scripts próprios são carregados de arquivos do próprio domínio", () => {
    expect(html).toContain('src="/scripts/gtag-init.js"');
    expect(html).toContain('src="/scripts/meta-pixel.js"');
  });
});

describe("CSP — valores de cabeçalho", () => {
  it("report-only cobre as origens realmente usadas", () => {
    const v = cspReportOnlyHeaderValue();
    for (const origem of [
      "https://grtxmbffgmgnkawlvqhm.supabase.co",
      "https://www.googletagmanager.com",
      "https://connect.facebook.net",
      "https://challenges.cloudflare.com",
      "https://cdn.pluggy.ai",
      "https://api.pluggy.ai",
      "https://fonts.gstatic.com",
      "https://img.logo.dev",
      "https://viacep.com.br",
      "https://brasilapi.com.br",
    ]) {
      expect(v).toContain(origem);
    }
    expect(v).toContain("worker-src 'self' blob:");
    expect(v).not.toContain("report-uri");
    expect(v).not.toContain("'unsafe-eval'");
    // script-src não usa 'unsafe-inline'
    const scriptSrc = v.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("img-src permite os logotipos do widget Pluggy (cdn.pluggy.ai)", () => {
    const imgSrc = cspReportOnlyHeaderValue()
      .split("; ")
      .find((d) => d.startsWith("img-src "))!;
    expect(imgSrc).toContain("https://cdn.pluggy.ai");
    // não abre as demais origens do Pluggy para imagens
    expect(imgSrc).not.toContain("https://api.pluggy.ai");
    expect(imgSrc).not.toContain("https://connect.pluggy.ai");
  });

  it("frame-ancestors em modo bloqueio permite o editor da Lovable e o domínio próprio", () => {
    const v = cspFrameAncestorsHeaderValue();
    expect(v.startsWith("frame-ancestors ")).toBe(true);
    expect(v).toContain("https://aveto360.com");
    expect(v).toContain("https://lovable.dev");
    // o cabeçalho de bloqueio não restringe scripts na fase 1
    expect(v).not.toContain("script-src");
  });

  it("frame-ancestors nunca usa curinga multi-inquilino", () => {
    // *.lovable.app / *.lovable.dev deixariam qualquer app de terceiros embutir
    // a nossa tela de login. Só origens exatas são aceitas.
    for (const origem of CSP_FRAME_ANCESTORS) {
      expect(origem).not.toContain("*");
    }
    expect(CSP_FRAME_ANCESTORS).not.toContain("https://*.lovable.app");
    expect(CSP_FRAME_ANCESTORS).not.toContain("https://*.lovable.dev");
    expect(cspFrameAncestorsHeaderValue()).not.toContain("*");
  });

  it("fase 1 entrega report-only e frame-ancestors separados", () => {
    const h = cspHeadersFase1();
    expect(Object.keys(h)).toContain("Content-Security-Policy-Report-Only");
    expect(h["Content-Security-Policy"]).toBe(cspFrameAncestorsHeaderValue());
  });
});

describe("CSP — observação sem dados sensíveis", () => {
  it("guarda apenas a origem, descartando caminho, query e sample", () => {
    const r = sanitizarViolacaoCsp({
      effectiveDirective: "script-src-elem",
      blockedURI: "https://evil.example.com/a/b.js?token=abc123&cpf=12345678901",
      documentURI: "https://aveto360.com/dp/colaboradores/123?cpf=12345678901",
      disposition: "report-only",
    });
    expect(r).toEqual({
      diretiva: "script-src-elem",
      bloqueado: "https://evil.example.com",
      paginaOrigem: "https://aveto360.com",
      modo: "report-only",
    });
    expect(JSON.stringify(r)).not.toMatch(/token|cpf|12345678901/);
  });

  it("normaliza blob e inline", () => {
    expect(sanitizarViolacaoCsp({ blockedURI: "blob:https://aveto360.com/x" }).bloqueado).toBe("blob:");
    expect(sanitizarViolacaoCsp({ blockedURI: "inline" }).bloqueado).toBe("inline");
  });
});
