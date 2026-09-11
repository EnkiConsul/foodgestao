import { act, render, renderHook, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Bell } from "lucide-react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PendenciasCard, useStablePendencias } from "@/components/dp/home/PendenciasCard";
import type { Pendencia } from "@/hooks/useDpPendencias";

// ---- Mocks -----------------------------------------------------------------
vi.mock("@/hooks/useCompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "empresa-teste" }),
}));

let mockPendenciasData: Pendencia[] | undefined = [];
let mockIsFetching = false;
vi.mock("@/hooks/useDpPendencias", () => ({
  useDpPendencias: () => ({
    data: mockPendenciasData,
    isLoading: false,
    isFetching: mockIsFetching,
    dataUpdatedAt: new Date("2026-09-11T03:00:00Z").getTime(),
    lastCalculatedAt: "2026-09-11T03:00:00Z",
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDpUserPrefs", () => ({
  useDpUserPrefs: () => ({
    prefs: { pendencias_adiadas: {}, favoritos: [], avisos_confirmados: [], extras: {} },
  }),
}));

vi.mock("@/hooks/useDpPendenciasDecisoes", () => ({
  useDpPendenciasDecisoes: () => ({ ignoradas: new Set(), adiadas: {} }),
}));



const antiga: Pendencia = {
  id: "antiga",
  icon: Bell,
  titulo: "Pendência anterior",
  subtitulo: "Permanece visível",
  tipo: "Documento",
  vencimento: null,
  atrasoDias: 1,
  url: "/dp/cadastros/pendencias",
};

const atualizada: Pendencia = {
  ...antiga,
  id: "atualizada",
  titulo: "Pendência atualizada",
};

describe("useStablePendencias", () => {
  it("mantém a lista confirmada até a atualização terminar", () => {
    const { result, rerender } = renderHook(
      (props) => useStablePendencias(props),
      {
        initialProps: {
          companyId: "empresa-a",
          data: [antiga] as Pendencia[] | undefined,
          dataUpdatedAt: 100,
          lastCalculatedAt: "2026-09-11T03:00:00Z" as string | null,
          isLoading: false,
          isFetching: false,
        },
      },
    );

    expect(result.current.data).toEqual([antiga]);

    act(() => {
      rerender({
        companyId: "empresa-a",
        data: [] as Pendencia[],
        dataUpdatedAt: 100,
        lastCalculatedAt: "2026-09-11T03:00:00Z",
        isLoading: false,
        isFetching: true,
      });
    });

    expect(result.current.data).toEqual([antiga]);
    expect(result.current.dataUpdatedAt).toBe(100);

    act(() => {
      rerender({
        companyId: "empresa-a",
        data: [atualizada] as Pendencia[],
        dataUpdatedAt: 200,
        lastCalculatedAt: "2026-09-11T04:00:00Z",
        isLoading: false,
        isFetching: false,
      });
    });

    expect(result.current.data).toEqual([atualizada]);
    expect(result.current.dataUpdatedAt).toBe(200);
  });

  it("não reutiliza pendências ao trocar de empresa", () => {
    const { result, rerender } = renderHook(
      (props) => useStablePendencias(props),
      {
        initialProps: {
          companyId: "empresa-a",
          data: [antiga] as Pendencia[] | undefined,
          dataUpdatedAt: 100,
          lastCalculatedAt: null as string | null,
          isLoading: false,
          isFetching: false,
        },
      },
    );

    act(() => {
      rerender({
        companyId: "empresa-b",
        data: undefined,
        dataUpdatedAt: 0,
        lastCalculatedAt: null,
        isLoading: true,
        isFetching: true,
      });
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.ready).toBe(false);
  });
});

describe("PendenciasCard", () => {
  beforeEach(() => {
    cleanup();
    mockPendenciasData = [];
    mockIsFetching = false;
  });

  it("renderiza título, data de atualização e contadores de urgência", () => {
    mockPendenciasData = [
      { id: "p1", icon: Bell, titulo: "Doc atrasado", subtitulo: "", tipo: "Documentos", vencimento: null, atrasoDias: 1, url: "/dp/cadastros/pendencias" },
      { id: "p2", icon: Bell, titulo: "Doc hoje", subtitulo: "", tipo: "Férias", vencimento: null, atrasoDias: 0, url: "/dp/cadastros/pendencias" },
      { id: "p3", icon: Bell, titulo: "Doc próximo", subtitulo: "", tipo: "Rescisão", vencimento: null, atrasoDias: -2, url: "/dp/cadastros/pendencias" },
    ];

    render(
      <MemoryRouter>
        <PendenciasCard />
      </MemoryRouter>,
    );

    expect(screen.getByText("Pendências do Sistema")).toBeInTheDocument();
    expect(screen.getByText("Atrasado: 1")).toBeInTheDocument();
    expect(screen.getByText("Hoje: 1")).toBeInTheDocument();
    expect(screen.getByText("Próximo: 1")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado\s+11\/09/)).toBeInTheDocument();
  });
});
