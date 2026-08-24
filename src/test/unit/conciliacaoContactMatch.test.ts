import { describe, expect, it } from "vitest";
import {
  bestContactMatch,
  contactMatchScore,
  stripAcquirerNoise,
} from "@/lib/conciliacao/contactMatch";
import { extractCounterparty, nameFromRow } from "@/lib/conciliacao/counterparty";

describe("nome da contraparte a partir do dado bruto", () => {
  const row = (descriptionRaw: string, description: string | null = null) => ({
    amount: -50,
    description,
    raw: { descriptionRaw },
  });

  it("lê o estabelecimento após o pipe no texto bruto", () => {
    expect(nameFromRow(row("Compra no débito|DELLA ELDORADO"))).toBe("DELLA ELDORADO");
  });

  it("ignora a descrição renomeada pelo usuário", () => {
    const cp = extractCounterparty(row("Compra no débito|TRIX ACADEMIA", "Combustivel"));
    expect(cp.name).toBe("Trix Academia");
    expect(cp.document).toBeNull();
  });

  it("funciona em transferências enviadas", () => {
    expect(nameFromRow(row("Transferência enviada|RAPTOR SYSTEM LTDA"))).toBe("RAPTOR SYSTEM LTDA");
  });

  it("cai para a descrição exibida quando não há bruto", () => {
    expect(nameFromRow({ amount: -10, description: "Pix enviado para ANTONIA BARROS" }))
      .toBe("ANTONIA BARROS");
  });
});

describe("casamento tolerante de fornecedor/cliente", () => {
  it("remove ruído de adquirente", () => {
    expect(stripAcquirerNoise("Rp3*FIT PROD NATURAIS")).toBe("FIT PROD NATURAIS");
    expect(stripAcquirerNoise("PAG*BARBEARIA CENTRO")).toBe("BARBEARIA CENTRO");
  });

  it("casa nome parcial e sufixo societário", () => {
    expect(contactMatchScore("DELLA ELDORADO", "Padaria Della")).toBeGreaterThan(0.6);
    expect(contactMatchScore("RAPTOR SYSTEM LTDA", "Raptor System")).toBeGreaterThan(0.8);
    expect(contactMatchScore("UBER DO BRASIL TECNOLOGIA LTDA.", "Uber")).toBeGreaterThan(0.6);
  });

  it("não casa nomes diferentes", () => {
    expect(contactMatchScore("POSTO MADRI", "Padaria Della")).toBe(0);
  });

  it("não sugere em empate técnico", () => {
    const tie = bestContactMatch("Della", [
      { id: "a", name: "Della" },
      { id: "b", name: "Della" },
    ]);
    expect(tie).toBeNull();
  });

  it("sugere o melhor candidato acima do limiar", () => {
    const best = bestContactMatch("RAPTOR SYSTEM LTDA", [
      { id: "a", name: "Posto Madri" },
      { id: "b", name: "Raptor System" },
    ]);
    expect(best?.id).toBe("b");
  });
});
