import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendenciaAcoes } from "./PendenciaAcoes";
import type { Pendencia } from "@/hooks/useDpPendencias";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useCompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "empresa-teste" }) }));
vi.mock("@/hooks/useDpPendenciasDecisoes", () => ({
  useDpPendenciasDecisoes: () => ({ decidir: {}, remover: {}, decisaoDe: new Map() }),
}));
vi.mock("@/hooks/useDpIntermitenteConfirmacoes", () => ({ useDpIntermitenteConfirmacoes: () => ({ responder: {} }) }));
vi.mock("@/components/dp/licencas/DpLicencaRetornoDialog", () => ({ DpLicencaRetornoDialog: () => null }));
vi.mock("@/components/dp/ferias/FeriasNovoModal", () => ({ FeriasNovoModal: () => null }));
vi.mock("@/components/dp/documentos/DpDocumentoImportarDialog", () => ({
  DpDocumentoImportarDialog: () => null, alvoImportacao: () => null,
}));

function Destino() {
  const location = useLocation();
  return <output data-testid="destino">{location.pathname + location.search}</output>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("decisões de solicitações nas Ações do Dia", () => {
  it.each([
    ["folga", "/dp/folgas?aba=solicitacoes"],
    ["ferias", "/dp/ferias"],
    ["tipo-futuro", "/dp/folgas?aba=solicitacoes"],
  ])("%s exige análise própria sem registrar decisão pelo atalho", (tipo, destino) => {
    const pendencia: Pendencia = {
      id: "sol-pedido-teste", icon: ClipboardList, titulo: "Pedido pendente",
      subtitulo: "Colaborador", tipo: "Solicitação", atrasoDias: 0,
      url: "/dp/folgas?aba=solicitacoes", solicitacao: { id: "pedido-teste", tipo },
    };
    const onNavigate = vi.fn();
    const onResolved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/dp/cadastros/pendencias"]}>
          <Routes>
            <Route path="/dp/cadastros/pendencias" element={
              <PendenciaAcoes pendencia={pendencia} onNavigate={onNavigate} onResolved={onResolved} />
            } />
            <Route path="/dp/folgas" element={<Destino />} />
            <Route path="/dp/ferias" element={<Destino />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(screen.getByTestId("destino").textContent).toBe(destino);
    expect(rpc).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onResolved).not.toHaveBeenCalled();
  });
});