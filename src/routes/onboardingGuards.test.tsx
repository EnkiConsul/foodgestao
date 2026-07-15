/**
 * Teste e2e (nível de router) — garante que uma conta com
 * `profiles.onboarding_completed = true`:
 *   1. Ao acessar `/hub`, permanece em `/hub` e nunca é redirecionada para `/onboarding`.
 *   2. Ao tentar acessar `/onboarding`, é imediatamente redirecionada para `/hub`.
 *
 * Regressão coberta: contas antigas presas no wizard após login.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ---- Mocks ----
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "teste@360food.app" },
    loading: false,
  }),
}));

const setContextMock = vi.fn();
vi.mock("@/hooks/useCompanyContext", () => ({
  useCompanyContext: () => ({ setContext: setContextMock }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
        }),
      },
    },
  },
}));

const resolveOnboardingStatusMock = vi.fn();
vi.mock("@/lib/onboardingStatus", () => ({
  resolveOnboardingStatus: (...args: unknown[]) => resolveOnboardingStatusMock(...args),
}));

import { ProtectedRoute, OnboardingGuard } from "@/routes/onboardingGuards";

function HubPage() {
  return <div data-testid="hub-page">HUB</div>;
}
function OnboardingPage() {
  return <div data-testid="onboarding-page">ONBOARDING</div>;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="/hub"
          element={
            <ProtectedRoute>
              <HubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <OnboardingGuard>
              <OnboardingPage />
            </OnboardingGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("[e2e] Login com onboarding_completed=true", () => {
  beforeEach(() => {
    resolveOnboardingStatusMock.mockReset();
    setContextMock.mockReset();
  });

  it("mantém o usuário em /hub e nunca renderiza o wizard de cadastro", async () => {
    resolveOnboardingStatusMock.mockResolvedValue({
      completed: true,
      companyId: "empresa-abc",
    });

    renderAt("/hub");

    await waitFor(() => {
      expect(screen.getByTestId("hub-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("onboarding-page")).not.toBeInTheDocument();
    expect(resolveOnboardingStatusMock).toHaveBeenCalledWith("user-123");
    // Contexto PJ é hidratado automaticamente para a empresa do usuário.
    expect(setContextMock).toHaveBeenCalledWith("pj", "empresa-abc");
  });

  it("redireciona /onboarding -> /hub quando o cadastro já está concluído", async () => {
    resolveOnboardingStatusMock.mockResolvedValue({
      completed: true,
      companyId: "empresa-abc",
    });

    renderAt("/onboarding");

    await waitFor(() => {
      expect(screen.getByTestId("hub-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("onboarding-page")).not.toBeInTheDocument();
  });

  it("também protege contas com onboarding_completed=true sem empresa vinculada", async () => {
    resolveOnboardingStatusMock.mockResolvedValue({
      completed: true,
      companyId: null,
    });

    renderAt("/hub");

    await waitFor(() => {
      expect(screen.getByTestId("hub-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("onboarding-page")).not.toBeInTheDocument();
    // Sem companyId, o contexto PJ não deve ser forçado.
    expect(setContextMock).not.toHaveBeenCalled();
  });
});
