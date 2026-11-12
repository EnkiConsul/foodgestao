import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";

const mutateAsync = vi.hoisted(() => vi.fn(async () => undefined));
const linhas = vi.hoisted(() => [
  {
    id: "e1", fingerprint: "a", company_id: "c1", company_name: "Pakere Pizzaria", company_cnpj: null,
    user_name: "Hanna", user_email: "h@x.com", surface: "Meu calendário", route: "/dp/meu/calendario", action: "trocar folga",
    severity: "error", source: "client", code: null, message: "Falha X", user_message: null, details: null,
    status: "aberto", status_note: null, occurrences: 2,
    first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    reports: [{ id: "r1", error_log_id: "e1", protocol: "ERR-0001", reporter_name: "Hanna", reporter_email: null, description: "Travou", attempted_action: null, route: null, status: "aberto", internal_note: null, created_at: new Date().toISOString() }],
    ocorrencias: [],
  },
  {
    id: "e2", fingerprint: "b", company_id: null, company_name: null, company_cnpj: null,
    user_name: null, user_email: null, surface: "rota", route: null, action: null,
    severity: "warning", source: "edge", code: null, message: "Falha Y", user_message: null, details: null,
    status: "aberto", status_note: null, occurrences: 1,
    first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-01T00:00:00Z", reports: [], ocorrencias: [],
  },
]);

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/useAppErrorLogs", () => ({
  FILTROS_ERRO_PADRAO: { dias: 30, status: "aberto", severity: "todos", source: "todos", busca: "" },
  useAppErrorLogs: () => ({ data: linhas, isLoading: false, error: null, refetch: vi.fn(), isFetching: false, dataUpdatedAt: 0 }),
  useAppErrorStatus: () => ({ mutateAsync, mutate: vi.fn(), isPending: false }),
  useAppErrorReportStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import AdminAuditoriaErros from "@/pages/admin/AuditoriaErros";

describe("tela de auditoria de erros", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("mostra empresa, chamado e resumo no topo", () => {
    render(<MemoryRouter><HelmetProvider><AdminAuditoriaErros /></HelmetProvider></MemoryRouter>);
    expect(screen.getAllByText("Pakere Pizzaria").length).toBeGreaterThan(0);
    expect(screen.getByText("Sem empresa identificada", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Chamado ERR-0001")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Com chamados de clientes/ }).textContent).toContain("1");
  });

  it("ignora vários erros de uma vez com justificativa única", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HelmetProvider><AdminAuditoriaErros /></HelmetProvider></MemoryRouter>);
    await user.click(screen.getByRole("checkbox", { name: "Selecionar todos os erros da lista" }));
    const barra = screen.getByRole("region", { name: "Ações para os erros selecionados" });
    await user.click(within(barra).getByRole("button", { name: /Ignorar/ }));
    const confirmar = screen.getByRole("button", { name: "Confirmar" });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText(/Observação/), "aviso esperado");
    await user.click(confirmar);
    expect(mutateAsync).toHaveBeenCalledWith({ id: ["e1", "e2"], status: "ignorado", nota: "aviso esperado" });
  });
});
