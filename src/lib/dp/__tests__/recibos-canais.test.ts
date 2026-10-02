import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("canais e sincronização dos recibos", () => {
  const emissor = readFileSync("supabase/functions/dp-recibo-emitir/index.ts", "utf8");
  const publico = readFileSync("supabase/functions/dp-recibo-publico/index.ts", "utf8");
  const tela = readFileSync("src/pages/dp/DpRecibos.tsx", "utf8");

  it("libera o link para colaborador cadastrado", () => {
    expect(emissor).not.toContain("Colaborador cadastrado assina pelo Portal ou à mão.");
    expect(publico).not.toContain("colabAtivo");
    expect(publico).toContain('admin.rpc("dp_recibo_assinar_externo"');
  });

  it("pessoa sem cadastro continua sem portal", () => {
    expect(emissor).toContain("Pessoa sem cadastro não acessa o portal.");
    expect(tela).toContain('CANAIS_ASSINATURA.filter((c) => !avulso || c.value !== "portal")');
  });
});
