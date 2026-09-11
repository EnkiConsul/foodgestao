import { act, renderHook } from "@testing-library/react";
import { Bell } from "lucide-react";
import { describe, expect, it } from "vitest";
import { useStablePendencias } from "@/components/dp/home/PendenciasCard";
import type { Pendencia } from "@/hooks/useDpPendencias";

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