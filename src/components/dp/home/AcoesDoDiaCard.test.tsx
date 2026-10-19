import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Bell } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcoesDoDiaCard } from "./AcoesDoDiaCard";
import { salvarPendenciasSnapshot } from "@/lib/dp/pendencias-cache";

const mocks = vi.hoisted(() => ({ refetch: vi.fn(), fetching: false }));
vi.mock("@/hooks/useCompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "empresa-teste" }) }));
vi.mock("@/hooks/useDpPendencias", () => ({
  useDpPendencias: () => ({ data: undefined, isLoading: false, isFetching: mocks.fetching, isError: true, refetch: mocks.refetch, dataUpdatedAt: 0, lastCalculatedAt: null }),
}));
vi.mock("@/hooks/useDpUserPrefs", () => ({ useDpUserPrefs: () => ({ prefs: { pendencias_adiadas: {} } }) }));
vi.mock("@/hooks/useDpPendenciasDecisoes", () => ({ useDpPendenciasDecisoes: () => ({ ignoradas: new Set(), adiadas: {} }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/dp/pendencias/PendenciaAcoes", () => ({ PendenciaAcoes: () => null }));

describe("Ações do Dia durante falha de atualização", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.refetch.mockReset();
    mocks.fetching = false;
  });
  afterEach(cleanup);

  function abrir() {
    render(<MemoryRouter><AcoesDoDiaCard /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ações do Dia" }));
  }

  function salvar() {
    salvarPendenciasSnapshot("empresa-teste", {
      data: [{ id: "acao-confirmada", icon: Bell, titulo: "Ação confirmada", subtitulo: "", tipo: "Documento", vencimento: null, atrasoDias: 1, url: "/dp/documentos" }],
      dataUpdatedAt: 100,
      lastCalculatedAt: null,
    });
  }

  it("preserva a ação confirmada e permite solicitar nova consulta", () => {
    salvar();
    abrir();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("não permite disparar outra tentativa enquanto a consulta está em curso", () => {
    salvar();
    mocks.fetching = true;
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Tentando atualizar…" }));
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("permite recuperar a consulta quando não há retrato salvo", () => {
    abrir();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});