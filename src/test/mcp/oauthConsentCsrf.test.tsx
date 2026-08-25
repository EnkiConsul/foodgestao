import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

const getSession = vi.fn();
const getAuthorizationDetails = vi.fn();
const approveAuthorization = vi.fn();
const denyAuthorization = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      oauth: {
        getAuthorizationDetails: (id: string) => getAuthorizationDetails(id),
        approveAuthorization: (id: string) => approveAuthorization(id),
        denyAuthorization: (id: string) => denyAuthorization(id),
      },
    },
  },
}));

import OAuthConsent from "@/pages/OAuthConsent";
import {
  createConsentNonce,
  clearConsentNonce,
  verifyConsentNonce,
  isFramed,
  applyConsentMetaHardening,
} from "@/lib/security/consentSecurity";

const SESSION = {
  session: {
    access_token: "csrf-secret-access-token",
    refresh_token: "csrf-secret-refresh-token",
    user: { id: "user-1", email: "rafael@example.com" },
  },
};

const DETAILS = {
  data: {
    client: { name: "Claude", redirect_uri: "https://claude.ai/callback" },
    scope: "openid email",
  },
  error: null,
};

let hrefSetter: ReturnType<typeof vi.fn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function renderConsent() {
  return render(
    <MemoryRouter initialEntries={["/.lovable/oauth/consent?authorization_id=auth-123"]}>
      <OAuthConsent />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  document.head.querySelectorAll('meta[name="robots"],meta[name="referrer"]').forEach((m) => m.remove());
  hrefSetter = vi.fn();
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: {
      pathname: "/.lovable/oauth/consent",
      search: "?authorization_id=auth-123",
      origin: "http://localhost:8080",
      set href(v: string) {
        hrefSetter(v);
      },
      get href() {
        return "http://localhost:8080/.lovable/oauth/consent?authorization_id=auth-123";
      },
    },
  });
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Consentimento OAuth — nonce anti-CSRF", () => {
  it("cria um nonce por authorization_id e só valida o valor emitido nesta aba", () => {
    const nonce = createConsentNonce("auth-123");
    expect(nonce).toMatch(/^[0-9a-f]{8,}$/);
    expect(verifyConsentNonce("auth-123", nonce)).toBe(true);
    // nonce forjado por terceiro
    expect(verifyConsentNonce("auth-123", "forjado")).toBe(false);
    // nonce válido, mas de outra autorização
    expect(verifyConsentNonce("outra-auth", nonce)).toBe(false);
    // sem nonce
    expect(verifyConsentNonce("auth-123", null)).toBe(false);
  });

  it("invalida o nonce após o uso, impedindo replay", () => {
    const nonce = createConsentNonce("auth-123");
    clearConsentNonce("auth-123");
    expect(verifyConsentNonce("auth-123", nonce)).toBe(false);
  });

  it("não aprova quando o nonce da sessão foi removido (requisição forjada)", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();

    const approve = await screen.findByRole("button", { name: /autorizar/i });
    window.sessionStorage.clear(); // simula decisão disparada fora do fluxo da página
    fireEvent.click(approve);

    await waitFor(() => expect(screen.getByText(/validar a origem desta solicitação/i)).toBeInTheDocument());
    expect(approveAuthorization).not.toHaveBeenCalled();
    expect(denyAuthorization).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("aprova quando o nonce criado pela página está intacto e o consome", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    approveAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/callback?code=abc" },
      error: null,
    });
    renderConsent();

    fireEvent.click(await screen.findByRole("button", { name: /autorizar/i }));
    await waitFor(() => expect(approveAuthorization).toHaveBeenCalledWith("auth-123"));
    expect(window.sessionStorage.getItem("oauth_consent_nonce:auth-123")).toBeNull();
  });

  it("não autoriza automaticamente no carregamento (exige interação do usuário)", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();

    await screen.findByRole("button", { name: /autorizar/i });
    expect(approveAuthorization).not.toHaveBeenCalled();
    expect(denyAuthorization).not.toHaveBeenCalled();
  });
});

describe("Consentimento OAuth — clickjacking e metadados", () => {
  it("detecta enquadramento em iframe", () => {
    const original = window.top;
    Object.defineProperty(window, "top", { configurable: true, value: {} as Window });
    expect(isFramed()).toBe(true);
    Object.defineProperty(window, "top", { configurable: true, value: original });
    expect(isFramed()).toBe(false);
  });

  it("bloqueia a tela quando carregada dentro de um frame", async () => {
    const original = window.top;
    Object.defineProperty(window, "top", { configurable: true, value: {} as Window });
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();

    await waitFor(() => expect(screen.getByText(/dentro de outro site/i)).toBeInTheDocument());
    expect(getSession).not.toHaveBeenCalled();
    expect(getAuthorizationDetails).not.toHaveBeenCalled();
    Object.defineProperty(window, "top", { configurable: true, value: original });
  });

  it("aplica noindex e no-referrer na página de consentimento", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toMatch(/noindex/);
      expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
    });
  });

  it("applyConsentMetaHardening é idempotente", () => {
    applyConsentMetaHardening();
    applyConsentMetaHardening();
    expect(document.head.querySelectorAll('meta[name="robots"]').length).toBe(1);
    expect(document.head.querySelectorAll('meta[name="referrer"]').length).toBe(1);
  });
});

describe("Headers de segurança servidos para a rota de consentimento", () => {
  const headers = readFileSync(path.resolve(process.cwd(), "public/_headers"), "utf8");
  const consentBlock = headers.slice(headers.indexOf("/.lovable/oauth/consent"));

  it("nega enquadramento e indexação e proíbe cache da rota de consentimento", () => {
    expect(consentBlock).toMatch(/X-Frame-Options:\s*DENY/i);
    expect(consentBlock).toMatch(/Content-Security-Policy:.*frame-ancestors 'none'/i);
    expect(consentBlock).toMatch(/Referrer-Policy:\s*no-referrer/i);
    expect(consentBlock).toMatch(/Cache-Control:.*no-store/i);
    expect(consentBlock).toMatch(/X-Robots-Tag:.*noindex/i);
    expect(consentBlock).toMatch(/X-Content-Type-Options:\s*nosniff/i);
  });

  it("mantém headers básicos globais", () => {
    expect(headers).toMatch(/X-Content-Type-Options:\s*nosniff/i);
    expect(headers).toMatch(/Referrer-Policy:/i);
  });
});

describe("Consentimento OAuth — sem vazamento de tokens", () => {
  it("não escreve tokens, sessão ou detalhes em console/log", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    approveAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/callback?code=abc" },
      error: null,
    });
    renderConsent();
    fireEvent.click(await screen.findByRole("button", { name: /autorizar/i }));
    await waitFor(() => expect(approveAuthorization).toHaveBeenCalled());

    const logged = [logSpy, warnSpy, errorSpy]
      .flatMap((spy) => spy.mock.calls.flat())
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    expect(logged).not.toContain("csrf-secret-access-token");
    expect(logged).not.toContain("csrf-secret-refresh-token");
    expect(logged).not.toContain("auth-123");
  });

  it("o código-fonte da tela não registra token, sessão ou authorization_id em log", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/pages/OAuthConsent.tsx"), "utf8");
    expect(src).not.toMatch(/console\.(log|debug|info|warn|error)/);
    expect(src).not.toMatch(/access_token|refresh_token|getToken\(/);
  });

  it("o nonce armazenado não contém o token da sessão", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();
    await screen.findByRole("button", { name: /autorizar/i });
    const stored = window.sessionStorage.getItem("oauth_consent_nonce:auth-123") ?? "";
    expect(stored.length).toBeGreaterThan(8);
    expect(stored).not.toContain("csrf-secret");
  });
});
