import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from "@/integrations/supabase/client";
import { aguardandoAnalise, impactoConfirmado, lerMinhasOcorrencias, resumoAssiduidadePortal, type MinhaOcorrencia } from "@/lib/dp/minhas-ocorrencias";

const base: MinhaOcorrencia = { id: "a", data_operacional: "2026-10-25", tipo: "falta", estado: "confirmada", origem: "colaborador", subtipo: null, folga_id: null, troca_id: null, minutos: null, horario_estimado: null, horario_real: null, justificativa_colaborador: "Motivo", analise_status: "analisada", analisado_em: null, impacta_assiduidade: "sim", assiduidade_risco: true, assiduidade_decidido_em: null };
describe("histórico próprio de ocorrências", () => {
  it("risco pendente não confirma perda do prêmio", () => { expect(impactoConfirmado(base)).toBe(false); expect(aguardandoAnalise(base)).toBe(true); });
  it("só decisão gravada de fato confirmado confirma impacto", () => { expect(impactoConfirmado({ ...base, assiduidade_decidido_em: "2026-10-25" })).toBe(true); });
  it("previsão não confirma impacto", () => { expect(impactoConfirmado({ ...base, tipo: "previsao_falta", assiduidade_decidido_em: "2026-10-25" })).toBe(false); });
  it("cancelamento não participa do prêmio", () => { expect(impactoConfirmado({ ...base, estado: "cancelada", assiduidade_decidido_em: "2026-10-25" })).toBe(false); expect(aguardandoAnalise({ ...base, estado: "cancelada" })).toBe(false); });
  it.each(["banco_horas_aviso", "compensacao_feriado", "troca_folga", "dispensa_aviso_art488"])("preserva ausência de impacto para %s", subtipo => { expect(impactoConfirmado({ ...base, subtipo, impacta_assiduidade: "nao", assiduidade_decidido_em: "2026-10-25" })).toBe(false); });
  it("confirmação do fato não equivale a análise", () => { expect(aguardandoAnalise({ ...base, analise_status: "pendente", assiduidade_risco: false })).toBe(true); });
  it("mês vazio não garante prêmio", () => { expect(resumoAssiduidadePortal([])).toBe("Sem impacto confirmado até agora"); });
  it("lê páginas completas do mesmo período", async () => {
    const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: { itens: Array.from({ length: 100 }, (_, i) => ({ ...base, id: String(i) })), total: 101 }, error: null } as never);
    rpc.mockResolvedValueOnce({ data: { itens: [{ ...base, id: "100" }], total: 101 }, error: null } as never);
    expect(await lerMinhasOcorrencias("2026-09-01", "2026-09-30")).toHaveLength(101);
    expect(rpc).toHaveBeenLastCalledWith("dp_portal_minhas_ocorrencias", { _inicio: "2026-09-01", _fim: "2026-09-30", _offset: 100, _limite: 100 });
  });
});