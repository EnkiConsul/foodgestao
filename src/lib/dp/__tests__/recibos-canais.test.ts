import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("canais e sincronização dos recibos", () => {
  const emissor = readFileSync("supabase/functions/dp-recibo-emitir/index.ts", "utf8");
  const publico = readFileSync("supabase/functions/dp-recibo-publico/index.ts", "utf8");
  const tela = readFileSync("src/pages/dp/DpRecibos.tsx", "utf8");

  it("bloqueia WhatsApp para colaborador cadastrado no servidor", () => {
    expect(emissor).toContain('b.canal_assinatura === "whatsapp"');
    expect(emissor).toContain("Colaborador cadastrado assina pelo Portal ou à mão.");
  });

  it("restringe o link público a pessoa sem cadastro", () => {
    expect(publico).toContain('row.colaborador_id || row.canal_assinatura !== "whatsapp"');
    expect(publico).toContain('admin.rpc("dp_recibo_assinar_externo"');
  });

  it("mostra canais compatíveis na emissão", () => {
    expect(tela).toContain('avulso ? c.value !== "portal" : c.value !== "whatsapp"');
  });
});