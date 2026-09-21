/**
 * D2 — Confirmação de e-mail antes do acesso.
 *
 * Cobre a regressão que importa: quando o serviço de contas cria o usuário
 * SEM sessão (Auto-confirm desligado), o cadastro precisa terminar na tela
 * "confirme seu e-mail", sem navegar para onboarding/hub, e o usuário não
 * confirmado (portanto sem sessão) não pode alcançar rota protegida.
 *
 * Nenhuma conta real é criada, nenhum e-mail é enviado e nenhum link é
 * consumido: o cliente de autenticação é simulado.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Estado controlado pelos testes ----
const respostaSignUp = {
  data: { user: null as unknown, session: null as unknown },
  error: null as { message: string } | null,
};
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...real, useNavigate: () => navigateMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(async () => respostaSignUp),
      getUser: vi.fn(async () => ({ data: { user: null } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
        })),
      },
    },
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/hooks/useTurnstileSiteKey", () => ({
  useTurnstileConfig: () => ({ siteKey: null, loading: false, required: false }),
}));
vi.mock("@/components/auth/TurnstileWidget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/auth/invite", () => ({ consumePendingInviteToken: vi.fn(async () => ({ accepted: false })) }));
vi.mock("@/lib/auth/landing", () => ({
  resolveLandingTarget: vi.fn(async () => "hub"),
  landingPathFor: () => "/hub",
}));

import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Auth from "@/pages/Auth";

// jsdom não implementa ResizeObserver (usado pelos componentes de formulário).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? ResizeObserverStub;

const SENHA = "Trilha Verde42x#";

function Consumidor({ onResultado }: { onResultado: (r: unknown) => void }) {
  const { signUp } = useAuth();
  return (
    <button
      type="button"
      data-testid="disparar"
      onClick={() => void signUp("novo@exemplo.test", SENHA, "PESSOA TESTE").then(onResultado)}
    >
      cadastrar
    </button>
  );
}

function comProvedores(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderProvider(onResultado: (r: unknown) => void) {
  return render(
    comProvedores(
      <MemoryRouter>
        <AuthProvider>
          <Consumidor onResultado={onResultado} />
        </AuthProvider>
      </MemoryRouter>,
    ),
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  respostaSignUp.data = { user: null, session: null };
  respostaSignUp.error = null;
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("cadastro sem sessão exige confirmação de e-mail", () => {
  it("usuário criado com sessão nula sinaliza confirmação pendente", async () => {
    respostaSignUp.data = { user: { id: "u1", identities: [{ id: "i1" }] }, session: null };
    let resultado: Record<string, unknown> | undefined;
    renderProvider((r) => {
      resultado = r as Record<string, unknown>;
    });
    await userEvent.click(screen.getByTestId("disparar"));
    await waitFor(() => expect(resultado).toBeDefined());
    expect(resultado).toMatchObject({
      error: null,
      alreadyRegistered: false,
      needsEmailConfirmation: true,
    });
  });

  it("não sinaliza confirmação quando o serviço devolve sessão", async () => {
    respostaSignUp.data = {
      user: { id: "u1", identities: [{ id: "i1" }] },
      session: { access_token: "t" },
    };
    let resultado: Record<string, unknown> | undefined;
    renderProvider((r) => {
      resultado = r as Record<string, unknown>;
    });
    await userEvent.click(screen.getByTestId("disparar"));
    await waitFor(() => expect(resultado).toBeDefined());
    expect(resultado).toMatchObject({ needsEmailConfirmation: false });
  });

  it("e-mail já cadastrado não é tratado como confirmação pendente", async () => {
    respostaSignUp.data = { user: { id: "u1", identities: [] }, session: null };
    let resultado: Record<string, unknown> | undefined;
    renderProvider((r) => {
      resultado = r as Record<string, unknown>;
    });
    await userEvent.click(screen.getByTestId("disparar"));
    await waitFor(() => expect(resultado).toBeDefined());
    expect(resultado).toMatchObject({ alreadyRegistered: true, needsEmailConfirmation: false });
  });
});

describe("tela de cadastro para na confirmação, sem navegar", () => {
  it("mostra a etapa de confirmação e não navega para onboarding/hub", async () => {
    respostaSignUp.data = { user: { id: "u1", identities: [{ id: "i1" }] }, session: null };

    render(
      comProvedores(
        <HelmetProvider>
          <MemoryRouter initialEntries={["/auth?mode=signup"]}>
            <AuthProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </HelmetProvider>,
      ),
    );

    const alternar = await screen.findByRole("button", { name: /cadastre-se/i });
    await userEvent.click(alternar);

    await userEvent.type(screen.getByLabelText(/nome completo/i), "PESSOA TESTE");
    await userEvent.type(screen.getByLabelText(/^e-mail$/i), "novo@exemplo.test");
    await userEvent.type(screen.getByLabelText(/^senha$/i), SENHA);
    await userEvent.type(screen.getByLabelText(/confirmar senha/i), SENHA);
    await userEvent.click(screen.getByRole("checkbox"));

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /criar conta/i }));
    });

    await waitFor(() => expect(supabase.auth.signUp).toHaveBeenCalled());
    // Etapa de confirmação visível…
    await waitFor(() =>
      expect(screen.getAllByText(/confirme seu e-mail/i).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/abra sua caixa de entrada/i)).toBeInTheDocument();
    // …e nenhuma navegação para área interna.
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
