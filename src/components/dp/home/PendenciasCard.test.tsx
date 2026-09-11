import { act, render, renderHook, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Bell } from "lucide-react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PendenciasCard, useStablePendencias } from "@/components/dp/home/PendenciasCard";
import type { Pendencia } from "@/hooks/useDpPendencias";
import { lerPendenciasSnapshot, salvarPendenciasSnapshot } from "@/lib/dp/pendencias-cache";

// ---- Mocks -----------------------------------------------------------------
vi.mock("@/hooks/useCompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "empresa-teste" }),
}));

let mockPendenciasData: Pendencia[] | undefined = [];
let mockIsFetching = false;
let mockIsRefreshing = false;
vi.mock("@/hooks/useDpPendencias", () => ({
  useDpPendencias: () => ({
    data: mockPendenciasData,
    isLoading: false,
    isFetching: mockIsFetching,
    isRefreshing: mockIsRefreshing,
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
  beforeEach(() => {
    localStorage.clear();
  });

  it("hidrata o último retrato guardado enquanto a nova apuração roda", () => {
    salvarPendenciasSnapshot("empresa-a", {
      data: [antiga],
      dataUpdatedAt: 50,
      lastCalculatedAt: "2026-09-10T03:00:00Z",
    });

    const { result } = renderHook(() =>
      useStablePendencias({
        companyId: "empresa-a",
        data: undefined,
        dataUpdatedAt: 0,
        lastCalculatedAt: null,
        isLoading: true,
        isFetching: true,
      }),
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.data.map((p) => p.id)).toEqual(["antiga"]);
    expect(result.current.lastCalculatedAt).toBe("2026-09-10T03:00:00Z");
  });

  it("grava o retrato quando a apuração termina e ignora cache corrompido", () => {
    const props = {
      companyId: "empresa-a",
      data: [atualizada] as Pendencia[],
      dataUpdatedAt: 300,
      lastCalculatedAt: "2026-09-11T06:00:00Z" as string | null,
      isLoading: false,
      isFetching: false,
    };
    renderHook(() => useStablePendencias(props));

    expect(lerPendenciasSnapshot("empresa-a")?.data.map((p) => p.id)).toEqual(["atualizada"]);

    localStorage.setItem("dp_pendencias_snapshot:empresa-a", "{{{");
    expect(lerPendenciasSnapshot("empresa-a")).toBeNull();
  });

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

  it("não troca o retrato por resposta vazia sem uma apuração mais nova", () => {
    salvarPendenciasSnapshot("empresa-a", {
      data: [antiga],
      dataUpdatedAt: 100,
      lastCalculatedAt: "2026-09-10T03:00:00Z",
    });

    const { result } = renderHook(() =>
      useStablePendencias({
        companyId: "empresa-a",
        data: [],
        dataUpdatedAt: 200,
        lastCalculatedAt: "2026-09-10T03:00:00Z",
        isLoading: false,
        isFetching: false,
      }),
    );

    expect(result.current.data.map((p) => p.id)).toEqual(["antiga"]);
    expect(lerPendenciasSnapshot("empresa-a")?.data.map((p) => p.id)).toEqual(["antiga"]);
  });

  it("aceita um quadro vazio quando uma apuração mais nova o confirma", () => {
    salvarPendenciasSnapshot("empresa-a", {
      data: [antiga],
      dataUpdatedAt: 100,
      lastCalculatedAt: "2026-09-10T03:00:00Z",
    });

    const { result } = renderHook(() =>
      useStablePendencias({
        companyId: "empresa-a",
        data: [],
        dataUpdatedAt: 200,
        lastCalculatedAt: "2026-09-11T03:00:00Z",
        isLoading: false,
        isFetching: false,
      }),
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(lerPendenciasSnapshot("empresa-a")?.data).toEqual([]);
  });

  it("recupera o retrato quando a empresa chega depois da primeira renderização", () => {
    salvarPendenciasSnapshot("empresa-a", {
      data: [antiga],
      dataUpdatedAt: 100,
      lastCalculatedAt: "2026-09-10T03:00:00Z",
    });

    const { result, rerender } = renderHook(
      (props) => useStablePendencias(props),
      {
        initialProps: {
          companyId: null as string | null,
          data: undefined as Pendencia[] | undefined,
          dataUpdatedAt: 0,
          lastCalculatedAt: null as string | null,
          isLoading: true,
          isFetching: false,
        },
      },
    );

    rerender({
      companyId: "empresa-a",
      data: [] as Pendencia[],
      dataUpdatedAt: 200,
      lastCalculatedAt: "2026-09-10T03:00:00Z",
      isLoading: false,
      isFetching: false,
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.data.map((p) => p.id)).toEqual(["antiga"]);
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
    mockIsRefreshing = false;
  });

  it("não gira a seta quando apenas relê o resultado já apurado", () => {
    mockIsFetching = true;
    render(
      <MemoryRouter>
        <PendenciasCard />
      </MemoryRouter>,
    );
    const botao = screen.getByTitle("Atualizar pendências agora");
    expect(botao).not.toBeDisabled();
    expect(botao.querySelector(".animate-spin")).toBeNull();
  });

  it("gira a seta somente quando uma apuração está em andamento", () => {
    mockIsRefreshing = true;
    render(
      <MemoryRouter>
        <PendenciasCard />
      </MemoryRouter>,
    );
    const botao = screen.getByTitle("Atualizar pendências agora");
    expect(botao).toBeDisabled();
    expect(botao.querySelector(".animate-spin")).not.toBeNull();
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

    expect(screen.getByText("Pendências")).toBeInTheDocument();
    expect(screen.getByText("Atrasado: 1")).toBeInTheDocument();
    expect(screen.getByText("Hoje: 1")).toBeInTheDocument();
    expect(screen.getByText("Próximo: 1")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado\s+11\/09/)).toBeInTheDocument();
  });
});
