import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

const SESSION = {
  session: {
    access_token: "super-secret-access-token",
    refresh_token: "super-secret-refresh-token",
    user: { id: "user-1", email: "rafael@example.com" },
  },
};

const DETAILS = {
  data: {
    client: { name: "Claude", redirect_uri: "https://claude.ai/api/mcp/callback" },
    scope: "openid email profile offline_access",
    // campos sensíveis que o provider pode devolver e que nunca devem ir para a tela
    client_secret: "cs_live_do_not_render",
    access_token: "at_do_not_render",
    authorization_id: "auth-123",
  },
  error: null,
};

function renderConsent(search = "?authorization_id=auth-123") {
  return render(
    <MemoryRouter initialEntries={[`/.lovable/oauth/consent${search}`]}>
      <OAuthConsent />
    </MemoryRouter>,
  );
}

let hrefSetter: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  hrefSetter = vi.fn();
  const loc = {
    pathname: "/.lovable/oauth/consent",
    search: "?authorization_id=auth-123",
    origin: "http://localhost:8080",
    get href() {
      return "http://localhost:8080/.lovable/oauth/consent?authorization_id=auth-123";
    },
    set href(v: string) {
      hrefSetter(v);
    },
  };
  Object.defineProperty(window, "location", { writable: true, configurable: true, value: loc });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuth consent — usuário autenticado", () => {
  it("redireciona para o login preservando a URL de consentimento quando não há sessão", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderConsent();

    await waitFor(() => expect(hrefSetter).toHaveBeenCalled());
    const target = hrefSetter.mock.calls[0][0] as string;
    expect(target.startsWith("/auth?redirect=")).toBe(true);
    expect(decodeURIComponent(target)).toContain("/.lovable/oauth/consent?authorization_id=auth-123");
    expect(getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("não consulta a autorização sem authorization_id", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    renderConsent("");

    await waitFor(() => expect(screen.getByText(/authorization_id ausente/i)).toBeInTheDocument());
    expect(getAuthorizationDetails).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("mostra a conta autenticada da sessão atual", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();

    await waitFor(() =>
      expect(screen.getByTestId("consent-account")).toHaveTextContent("rafael@example.com"),
    );
  });

  it("aprova/recusa somente o authorization_id da URL e segue o redirect do provider", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    approveAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/api/mcp/callback?code=abc" },
      error: null,
    });
    renderConsent();

    fireEvent.click(await screen.findByRole("button", { name: /autorizar/i }));
    await waitFor(() => expect(approveAuthorization).toHaveBeenCalledWith("auth-123"));
    expect(denyAuthorization).not.toHaveBeenCalled();
    expect(hrefSetter).toHaveBeenCalledWith("https://claude.ai/api/mcp/callback?code=abc");
  });

  it("recusa chama denyAuthorization e nunca aprova", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    denyAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/api/mcp/callback?error=access_denied" },
      error: null,
    });
    renderConsent();

    fireEvent.click(await screen.findByRole("button", { name: /recusar/i }));
    await waitFor(() => expect(denyAuthorization).toHaveBeenCalledWith("auth-123"));
    expect(approveAuthorization).not.toHaveBeenCalled();
  });
});

describe("OAuth consent — escopos", () => {
  it("exibe os escopos solicitados em linguagem clara, inclusive desconhecidos", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    renderConsent();

    const list = await screen.findByTestId("consent-scopes");
    expect(list).toHaveTextContent(/endereço de e-mail/i);
    expect(list).toHaveTextContent(/perfil básico/i);
    expect(list).toHaveTextContent(/Permissão adicional solicitada: offline_access/i);
    // não deve inventar escopos que o cliente não pediu
    expect(list).not.toHaveTextContent(/admin/i);
  });

  it("não exibe lista de escopos quando o provider não informa nenhum", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue({
      data: { client: { name: "Claude" } },
      error: null,
    });
    renderConsent();

    await screen.findByRole("button", { name: /autorizar/i });
    expect(screen.queryByTestId("consent-scopes")).toBeNull();
  });
});

describe("OAuth consent — não expõe dados sensíveis", () => {
  it("não renderiza tokens, client_secret nem JSON bruto", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    const { container } = renderConsent();

    await screen.findByRole("button", { name: /autorizar/i });
    const html = container.innerHTML;
    for (const secret of [
      "super-secret-access-token",
      "super-secret-refresh-token",
      "cs_live_do_not_render",
      "at_do_not_render",
      "auth-123",
    ]) {
      expect(html).not.toContain(secret);
    }
    expect(html).not.toContain("client_secret");
    expect(html).not.toMatch(/\{"|"\}/);
  });

  it("mostra apenas o host do redirect, não a URL completa com query", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue({
      data: {
        client: { name: "Claude", redirect_uri: "https://claude.ai/callback?state=secret-state-value" },
        scope: "openid",
      },
      error: null,
    });
    const { container } = renderConsent();

    await waitFor(() => expect(screen.getByTestId("consent-redirect")).toHaveTextContent("claude.ai"));
    expect(container.innerHTML).not.toContain("secret-state-value");
  });

  it("mostra o erro do provider sem revelar detalhes da autorização", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue({
      data: null,
      error: { message: "Authorization expired" },
    });
    const { container } = renderConsent();

    await waitFor(() => expect(screen.getByText("Authorization expired")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /autorizar/i })).toBeNull();
    expect(container.innerHTML).not.toContain("auth-123");
  });
});
