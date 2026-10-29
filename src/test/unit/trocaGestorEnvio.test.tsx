import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), pdf: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, storage: { from: () => ({ upload: mocks.upload }) } } }));
vi.mock("@/lib/dp/termo-troca-gestor", () => ({ termoTrocaGestorPdf: mocks.pdf }));
vi.mock("@/lib/dp/rotina-cache", () => ({ invalidarRotina: vi.fn() }));
import { useRegistrarTrocaGestor } from "@/hooks/useTrocaGestor";
const input = { companyId: "empresa", solicitanteId: "hanna", destinoId: "veronica", dataOriginal: "2026-10-29", dataProposta: "2026-11-02", motivo: "Troca com Verônica", cienteDsr: true, notificar: true };
describe("envio dos termos junto com a troca", () => {
  it("envia somente Hanna e reutiliza pedido/arquivo depois de resposta incerta", async () => {
    mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.upload.mockResolvedValue({ error: null });
    let commits = 0;
    mocks.rpc.mockImplementation(async (name: string) => name === "dp_troca_gestor_previa" ? { error: null, data: { riscos: [], em_admissao: true, participantes: [
      { colaborador_id: "hanna", nome: "Hanna Civil", formal: true, portal: true, data_original: input.dataOriginal, data_nova: input.dataProposta, empresa: "Empresa" },
      { colaborador_id: "veronica", nome: "Verônica Civil", formal: false, portal: false, data_original: input.dataProposta, data_nova: input.dataOriginal, empresa: "Empresa" },
    ] } } : { error: ++commits === 1 ? { message: "Conexão interrompida" } : null, data: { troca_id: "troca", status: "aprovada" } });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRegistrarTrocaGestor(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow("Conexão interrompida"); });
    await act(async () => { await result.current.mutateAsync(input); });
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.pdf.mock.calls[0][0]).toMatchObject({ nome: "Hanna Civil", dataFixa: "2026-10-29", dataNova: "2026-11-02", trocaEntrePessoas: true });
    expect(mocks.pdf.mock.calls[0][0]).not.toHaveProperty("motivo");
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const chamadas = mocks.rpc.mock.calls.filter(c => c[0] === "dp_troca_gestor_registrar_documentada");
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0][1]._requisicao).toBe(chamadas[1][1]._requisicao);
    expect(chamadas[0][1]._arquivos.map((a: { colaborador_id: string }) => a.colaborador_id)).toEqual(["hanna"]);
    expect(mocks.rpc.mock.calls.filter(c => c[0] === "dp_troca_gestor_previa")).toHaveLength(1);
  });
});