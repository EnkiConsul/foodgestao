/**
 * AUD-021 — nenhuma credencial temporária pode chegar a ferramentas de análise.
 *
 * Todos os valores aqui são FICTÍCIOS. Nada é enviado para terceiros: o Google
 * tag e o pixel da Meta são substituídos por espiões em memória, e qualquer
 * tentativa de rede (fetch/Image/sendBeacon) é interceptada e reprovada.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
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
import { trackEvent } from "@/lib/analytics";

const TOKEN_FICTICIO = "tok_ficticio_0000";
const CODIGO_FICTICIO = "cod_ficticio_1111";

const bootstrap = readFileSync("public/scripts/tracking-privacy.js", "utf8");
const gtagInit = readFileSync("public/scripts/gtag-init.js", "utf8");
const metaPixel = readFileSync("public/scripts/meta-pixel.js", "utf8");

/** Carrega o script de bootstrap real em um objeto window simulado. */
function carregarBootstrap(win: Record<string, unknown>) {
  const fn = new Function("window", "document", "localStorage", `${bootstrap}\nreturn window.__avetoTracking;`);
  return fn(win, win.document, (win as { localStorage?: unknown }).localStorage);
}

function fakeWindow(href: string) {
  const url = new URL(href);
  const chamadas: unknown[][] = [];
  const win: Record<string, unknown> = {
    location: { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, href },
    dataLayer: [] as unknown[],
    addEventListener: () => undefined,
    document: {
      referrer: "",
      createElement: () => ({ setAttribute: () => undefined }),
      getElementsByTagName: () => [{ parentNode: { insertBefore: () => undefined } }],
    },
    localStorage: { getItem: () => JSON.stringify({ marketing: true }) },
    __chamadas: chamadas,
  };
  return { win, chamadas };
}

describe("regras de rota sensível", () => {
  it("reconhece as rotas de credencial", () => {
    for (const rota of ["/auth", "/auth/entrar", "/ativar-acesso", "/redefinir-acesso", "/convite/abc", "/.lovable/oauth/consent"]) {
      expect(isSensitivePath(rota)).toBe(true);
    }
    expect(SENSITIVE_PREFIXES).toContain("/ativar-acesso");
  });

  it("libera rotas de produto", () => {
    for (const rota of ["/", "/hub", "/dp", "/relatorios/fluxo-caixa", "/planos"]) {
      expect(isSensitivePath(rota)).toBe(false);
    }
  });

  it("bloqueia query e fragmento com credencial, inclusive fora de rota sensível", () => {
    expect(hasSensitiveParams(`?t=${TOKEN_FICTICIO}&c=${CODIGO_FICTICIO}`)).toBe(true);
    expect(hasSensitiveParams("", `#access_token=${TOKEN_FICTICIO}&type=recovery`)).toBe(true);
    expect(isSensitiveLocation("/hub", `?token=${TOKEN_FICTICIO}`, "")).toBe(true);
    expect(isSensitiveLocation("/hub", "?utm_source=email", "")).toBe(false);
  });

  it("sanitiza mantendo apenas a allowlist e nunca o fragmento", () => {
    expect(sanitizePath("/ativar-acesso", `?t=${TOKEN_FICTICIO}&utm_source=email`)).toBe("/ativar-acesso?utm_source=email");
    expect(sanitizeUrl("https://aveto360.com", "/planos", `?c=${CODIGO_FICTICIO}`)).toBe("https://aveto360.com/planos");
    expect(sanitizePath("/planos", "?utm_campaign=x&segredo=y")).toBe("/planos?utm_campaign=x");
    expect(ALLOWED_PARAMS).not.toContain("t");
  });

  it("reduz o referrer a origem, interno ou direto", () => {
    expect(safeReferrer(`https://aveto360.com/ativar-acesso?t=${TOKEN_FICTICIO}`, "https://aveto360.com")).toBe("internal");
    expect(safeReferrer("https://google.com/search?q=x", "https://aveto360.com")).toBe("https://google.com");
    expect(safeReferrer("", "https://aveto360.com")).toBe("direct");
  });
});

describe("paridade entre a fonte TypeScript e o bootstrap", () => {
  it("as três listas são idênticas nos dois arquivos", () => {
    const api = carregarBootstrap(fakeWindow("https://aveto360.com/").win) as {
      SENSITIVE_PREFIXES: string[];
      SENSITIVE_PARAMS: string[];
      ALLOWED_PARAMS: string[];
    };
    expect(api.SENSITIVE_PREFIXES).toEqual([...SENSITIVE_PREFIXES]);
    expect(api.SENSITIVE_PARAMS).toEqual([...SENSITIVE_PARAMS]);
    expect(api.ALLOWED_PARAMS).toEqual([...ALLOWED_PARAMS]);
  });

  it("os trackers do bootstrap consultam a decisão de privacidade", () => {
    expect(gtagInit).toContain("__avetoTracking");
    expect(gtagInit).toContain("isSensitiveLocation");
    expect(metaPixel).toContain("rotaSensivel()");
    // Nenhum tracker pode ler a URL completa nem o referrer bruto.
    expect(gtagInit).not.toMatch(/location\.href/);
    expect(metaPixel).not.toMatch(/location\.href/);
    expect(gtagInit).not.toMatch(/page_referrer:\s*document\.referrer/);
  });
});

describe("carga inicial antes do React (scripts reais)", () => {
  function rodarGtag(href: string, referrer = "https://google.com/search?q=aveto") {
    const { win } = fakeWindow(href);
    const chamadas: unknown[][] = [];
    carregarBootstrap(win);
    (win.document as { referrer: string }).referrer = referrer;
    win.gtag = undefined;
    new Function("window", "document", gtagInit)(win, win.document);
    for (const args of win.dataLayer as ArrayLike<unknown>[]) chamadas.push(Array.from(args));
    return chamadas;
  }

  it("rota de ativação com token não envia visualização", () => {
    const chamadas = rodarGtag(`https://aveto360.com/ativar-acesso?t=${TOKEN_FICTICIO}&c=${CODIGO_FICTICIO}`);
    const config = chamadas.find((c) => c[0] === "config");
    expect(config?.[2]).toEqual({ send_page_view: false });
    expect(JSON.stringify(chamadas)).not.toContain(TOKEN_FICTICIO);
    expect(JSON.stringify(chamadas)).not.toContain(CODIGO_FICTICIO);
  });

  it("rota pública envia apenas URL sanitizada e referrer reduzido", () => {
    const chamadas = rodarGtag("https://aveto360.com/planos?utm_source=email&ref=parceiro-ficticio");
    const config = chamadas.find((c) => c[0] === "config") as [string, string, Record<string, string>];
    expect(config[2].page_path).toBe("/planos?utm_source=email");
    expect(config[2].page_location).toBe("https://aveto360.com/planos?utm_source=email");
    expect(config[2].page_referrer).toBe("https://google.com");
    expect(JSON.stringify(chamadas)).not.toContain("parceiro-ficticio");
  });

  it("pixel da Meta respeita consentimento e rota sensível", () => {
    function rodarPixel(href: string, marketing: boolean) {
      const { win } = fakeWindow(href);
      carregarBootstrap(win);
      (win.localStorage as { getItem: () => string }).getItem = () => JSON.stringify({ marketing });
      const eventos: unknown[][] = [];
      win.fbq = undefined;
      // Impede o carregamento real do script da Meta.
      (win.document as { getElementsByTagName: unknown }).getElementsByTagName = () => [
        { parentNode: { insertBefore: () => undefined } },
      ];
      // `with` dá ao script o mesmo alcance global simulado (o pixel usa `fbq` solto).
      new Function("window", "document", "localStorage", `with (window) {\n${metaPixel}\n}`)(
        win,
        win.document,
        win.localStorage,
      );
      const fbq = win.fbq as (...args: unknown[]) => void;
      const original = fbq;
      win.fbq = (...args: unknown[]) => {
        eventos.push(args);
        return original(...args);
      };
      const fila = ((win.fbq as unknown as { queue?: unknown[] }).queue ?? []) as unknown[][];
      return { eventos: fila.map((a) => Array.from(a)), pageView: win.__avetoPixelPageView as () => boolean };
    }

    const sensivel = rodarPixel(`https://aveto360.com/redefinir-acesso?t=${TOKEN_FICTICIO}`, true);
    expect(sensivel.eventos.some((e) => e[0] === "track")).toBe(false);
    expect(sensivel.pageView()).toBe(false);

    const semConsentimento = rodarPixel("https://aveto360.com/planos", false);
    expect(semConsentimento.eventos.some((e) => e[0] === "track")).toBe(false);
    expect(semConsentimento.pageView()).toBe(false);

    const publica = rodarPixel("https://aveto360.com/planos?utm_source=email", true);
    expect(publica.eventos.some((e) => e[0] === "track" && e[1] === "PageView")).toBe(true);
    expect(publica.pageView()).toBe(true);
  });
});

describe("eventos manuais (trackEvent) no app", () => {
  const original = { href: "", gtag: undefined as unknown };
  const rede: string[] = [];

  beforeEach(() => {
    rede.length = 0;
    vi.stubGlobal("fetch", (url: string) => {
      rede.push(String(url));
      return Promise.reject(new Error("rede bloqueada no teste"));
    });
    (navigator as unknown as { sendBeacon?: unknown }).sendBeacon = (url: string) => {
      rede.push(String(url));
      return false;
    };
    original.href = window.location.href;
    window.dataLayer = [];
    window.gtag = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", original.href || "/");
  });

  function irPara(url: string) {
    window.history.replaceState({}, "", url);
  }

  it("não registra nada em rota de credencial", () => {
    irPara(`/ativar-acesso?t=${TOKEN_FICTICIO}&c=${CODIGO_FICTICIO}`);
    trackEvent("signup_form_view", { referrer: "internal" });
    expect(window.dataLayer).toHaveLength(0);
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("não registra em rota pública quando a URL traz credencial", () => {
    irPara(`/planos?token=${TOKEN_FICTICIO}`);
    trackEvent("cta_click_trial");
    expect(window.dataLayer).toHaveLength(0);
  });

  it("registra em rota pública com contexto sanitizado", () => {
    irPara("/planos?utm_source=email&ref=parceiro-ficticio");
    trackEvent("cta_click_trial");
    expect(window.dataLayer).toHaveLength(1);
    const evento = JSON.stringify(window.dataLayer[0]);
    expect(evento).toContain("/planos?utm_source=email");
    expect(evento).not.toContain("parceiro-ficticio");
    expect(evento).not.toContain(TOKEN_FICTICIO);
  });

  it("nenhuma requisição de rede saiu durante os testes", () => {
    expect(rede).toEqual([]);
  });
});
