import { describe, expect, it } from "vitest";
import { resolverOpcaoUpgrade } from "./coberturaUpgrade";

// Intl usa espaço não separável depois de "R$".
const txt = (s: string) => s.replace(/\u00a0/g, " ");

const up = { plano: "pessoas-enterprise", nome: "Pessoas 360° Enterprise", preco_mensal_cents: null, enterprise: true };

describe("resolverOpcaoUpgrade", () => {
  it("Enterprise do Pessoas é contratado direto: R$ 10 por ativo, base de 19 (R$ 190)", () => {
    const r = resolverOpcaoUpgrade(up, {
      slug: "pessoas-enterprise", is_enterprise: false, price_monthly_cents: 19000,
      features: { min_collaborators: 19, price_per_collaborator_cents: 1000 },
    });
    expect(r.tipo).toBe("direto");
    expect(txt(r.texto)).toContain("R$ 10,00 por colaborador ativo");
    expect(txt(r.texto)).toContain("base de 19");
    expect(txt(r.texto)).toContain("R$ 190,00");
  });

  it("plano sob consulta no catálogo continua com o especialista", () => {
    const r = resolverOpcaoUpgrade({ ...up, plano: "financeiro-enterprise" }, {
      slug: "financeiro-enterprise", is_enterprise: true, price_monthly_cents: 0, features: {},
    });
    expect(r.tipo).toBe("especialista");
  });

  it("plano de franquia fixa mostra a mensalidade do catálogo", () => {
    const r = resolverOpcaoUpgrade({ plano: "pessoas-gestao", nome: "Gestão", preco_mensal_cents: 8990, enterprise: false }, {
      slug: "pessoas-gestao", is_enterprise: false, price_monthly_cents: 8990, features: { max_collaborators: 8 },
    });
    expect(r.tipo).toBe("direto");
    expect(txt(r.texto)).toBe("R$ 89,90/mês");
  });
});
