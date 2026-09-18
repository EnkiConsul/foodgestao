/**
 * AUD-021 — métricas de marketing desativadas neste aplicativo.
 *
 * A contenção verificada aqui é "nenhum tracker existe": nenhum SDK de Google
 * ou Meta é carregado ou inicializado, nada é enfileirado para reenvio futuro,
 * e nenhum caminho (consentimento, navegação no SPA, evento manual) reativa a
 * coleta. Todos os valores são FICTÍCIOS; qualquer tentativa de rede é
 * interceptada e reprova o teste.
 *
 * Os sanitizadores de URL continuam testados porque permanecem no código para
 * a reativação futura — mas nada os usa para enviar dados hoje.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { renderHook } from "@testing-library/react";
import {
  ALLOWED_PARAMS,
  SENSITIVE_PARAMS,
  SENSITIVE_PREFIXES,
  hasSensitiveParams,
  isSensitiveLocation,
  isSensitivePath,
  safeReferrer,
  sanitizePath,
  sanitizeUrl,
} from "@/lib/security/trackingPrivacy";
import { trackEvent, FunnelStep } from "@/lib/analytics";
import { usePageviewTracking } from "@/hooks/usePageviewTracking";

const TOKEN_FICTICIO = "tok_ficticio_0000";
const CODIGO_FICTICIO = "cod_ficticio_1111";

const html = readFileSync("index.html", "utf8");
const analytics = readFileSync("src/lib/analytics.ts", "utf8");
const hook = readFileSync("src/hooks/usePageviewTracking.ts", "utf8");

describe("AUD-021 — nenhum tracker no aplicativo (bootstrap)", () => {
  it("os scripts de bootstrap dos trackers não existem mais", () => {
    expect(existsSync("public/scripts/gtag-init.js")).toBe(false);
    expect(existsSync("public/scripts/meta-pixel.js")).toBe(false);
    expect(existsSync("public/scripts/tracking-privacy.js")).toBe(false);
  });

  it("a página não carrega, inicializa nem pré-conecta SDK de marketing", () => {
    for (const marca of [
      "googletagmanager",
      "google-analytics",
      "connect.facebook.net",
      "facebook.com/tr",
      "gtag(",
      "fbq(",
      "dataLayer",
      "gtag-init",
      "meta-pixel",
      "tracking-privacy",
    ]) {
      expect(html).not.toContain(marca);
    }
    expect(html).not.toContain("<noscript");
  });

  it("o logger de segurança de CSP continua ativo (não é métrica de marketing)", () => {
    const main = readFileSync("src/main.tsx", "utf8");
    expect(main).toContain("installCspViolationLogger()");
  });

  it("nenhum módulo do app chama gtag, fbq ou dataLayer", () => {
    for (const fonte of [analytics, hook]) {
      expect(fonte).not.toMatch(/window\.(gtag|fbq|dataLayer)/);
      expect(fonte).not.toMatch(/\bfbq\s*\(/);
    }
    // Sem fila para reenvio futuro: fila guardada seria vazamento adiado.
    expect(analytics).not.toMatch(/push\(|queue|replay|buffer/i);
  });
});

describe("AUD-021 — trackEvent e visualizações são no-op", () => {
  const rede: string[] = [];
  let hrefOriginal = "/";

  beforeEach(() => {
    rede.length = 0;
    hrefOriginal = window.location.href;
    vi.stubGlobal("fetch", (url: string) => {
      rede.push(String(url));
      return Promise.reject(new Error("rede bloqueada no teste"));
    });
    (navigator as unknown as { sendBeacon?: unknown }).sendBeacon = (url: string) => {
      rede.push(String(url));
      return false;
    };
    (window as unknown as Record<string, unknown>).gtag = vi.fn();
    (window as unknown as Record<string, unknown>).fbq = vi.fn();
    (window as unknown as Record<string, unknown>).dataLayer = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).gtag;
    delete (window as unknown as Record<string, unknown>).fbq;
    delete (window as unknown as Record<string, unknown>).dataLayer;
    window.history.replaceState({}, "", hrefOriginal || "/");
  });

  function espioes() {
    const w = window as unknown as { gtag: ReturnType<typeof vi.fn>; fbq: ReturnType<typeof vi.fn>; dataLayer: unknown[] };
    return w;
  }

  it("evento manual com token fictício não chama nada e não enfileira", () => {
    window.history.replaceState({}, "", `/ativar-acesso?c=${CODIGO_FICTICIO}&t=${TOKEN_FICTICIO}`);
    trackEvent(FunnelStep.SignupFormView, { page_location: window.location.href, referrer: document.referrer });
    const w = espioes();
    expect(w.gtag).not.toHaveBeenCalled();
    expect(w.fbq).not.toHaveBeenCalled();
    expect(w.dataLayer).toHaveLength(0);
    expect(rede).toEqual([]);
  });

  it("evento manual em rota pública de marketing também não envia nada", () => {
    window.history.replaceState({}, "", "/planos?utm_source=email");
    trackEvent(FunnelStep.CtaClick, { plano: "pro" });
    const w = espioes();
    expect(w.gtag).not.toHaveBeenCalled();
    expect(w.fbq).not.toHaveBeenCalled();
    expect(w.dataLayer).toHaveLength(0);
  });

  it("chamador não consegue injetar URL, título ou referrer em campo de contexto", () => {
    trackEvent("evento_injetado", {
      page_location: `https://aveto360.com/ativar-acesso?t=${TOKEN_FICTICIO}`,
      page_path: `/convite/${TOKEN_FICTICIO}`,
      page_title: TOKEN_FICTICIO,
      referrer: `https://aveto360.com/redefinir-acesso?t=${TOKEN_FICTICIO}`,
    });
    const w = espioes();
    expect(JSON.stringify(w.dataLayer)).not.toContain(TOKEN_FICTICIO);
    expect(w.gtag).not.toHaveBeenCalled();
    expect(rede).toEqual([]);
  });

  it("navegação no SPA (inclusive para rota com credencial) não dispara nada", () => {
    window.history.replaceState({}, "", "/");
    const { rerender, unmount } = renderHook(() => usePageviewTracking());
    window.history.replaceState({}, "", `/ativar-acesso?c=${CODIGO_FICTICIO}&t=${TOKEN_FICTICIO}`);
    rerender();
    window.history.replaceState({}, "", `/auth#access_token=${TOKEN_FICTICIO}&type=recovery`);
    rerender();
    const w = espioes();
    expect(w.gtag).not.toHaveBeenCalled();
    expect(w.fbq).not.toHaveBeenCalled();
    expect(w.dataLayer).toHaveLength(0);
    expect(rede).toEqual([]);
    unmount();
  });

  it("mudança de consentimento de marketing não reativa coleta", () => {
    localStorage.setItem("plin_cookie_consent", JSON.stringify({ marketing: true, analytics: true }));
    window.dispatchEvent(new CustomEvent("plin:cookie-consent-change", { detail: { marketing: true } }));
    trackEvent(FunnelStep.SignupSuccess, { method: "email" });
    const w = espioes();
    expect(w.gtag).not.toHaveBeenCalled();
    expect(w.fbq).not.toHaveBeenCalled();
    expect(w.dataLayer).toHaveLength(0);
    localStorage.removeItem("plin_cookie_consent");
  });
});

describe("sanitizadores preservados para a reativação futura", () => {
  it("reconhecem rotas com credencial", () => {
    for (const rota of ["/auth", "/ativar-acesso", "/redefinir-acesso", "/convite/abc", "/.lovable/oauth/consent"]) {
      expect(isSensitivePath(rota)).toBe(true);
    }
    expect(isSensitivePath("/planos")).toBe(false);
    expect(SENSITIVE_PREFIXES).toContain("/ativar-acesso");
    expect(SENSITIVE_PARAMS).toContain("token");
    expect(ALLOWED_PARAMS).not.toContain("t");
  });

  it("detectam credencial em query e fragmento", () => {
    expect(hasSensitiveParams(`?t=${TOKEN_FICTICIO}`)).toBe(true);
    expect(hasSensitiveParams("", `#access_token=${TOKEN_FICTICIO}`)).toBe(true);
    expect(isSensitiveLocation("/hub", `?token=${TOKEN_FICTICIO}`, "")).toBe(true);
  });

  it("sanitizam por allowlist, sem fragmento e sem referrer bruto", () => {
    expect(sanitizePath("/ativar-acesso", `?t=${TOKEN_FICTICIO}&utm_source=email`)).toBe("/ativar-acesso?utm_source=email");
    expect(sanitizeUrl("https://aveto360.com", "/planos", `?c=${CODIGO_FICTICIO}`)).toBe("https://aveto360.com/planos");
    expect(safeReferrer(`https://aveto360.com/convite/${TOKEN_FICTICIO}`, "https://aveto360.com")).toBe("internal");
    expect(safeReferrer("https://google.com/search?q=x", "https://aveto360.com")).toBe("https://google.com");
  });
});
