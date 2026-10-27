import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    contexto: "cliente",
    rpc(this: { contexto?: string }, name: string, args: Record<string, unknown>) {
      if (this?.contexto !== "cliente") throw new Error("cliente sem contexto");
      if (name !== "dp_troca_gestor_previa" || args._dest !== "provisorio") throw new Error("chamada incorreta");
      return Promise.resolve({ data: { em_admissao: true, riscos: [] }, error: null });
    },
  },
}));

import { previaTrocaGestor } from "@/hooks/useTrocaGestor";

describe("prévia administrativa", () => {
  it("mantém o contexto do cliente ao consultar pessoa provisória sem portal", async () => {
    await expect(previaTrocaGestor({ companyId: "empresa", solicitanteId: "clt", destinoId: "provisorio", dataOriginal: "2026-10-26", dataProposta: "2026-10-29" })).resolves.toEqual({ em_admissao: true, riscos: [] });
  });
});