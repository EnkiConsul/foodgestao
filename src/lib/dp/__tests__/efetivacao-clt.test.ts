import { describe, it, expect } from "vitest";
import { ehEfetivacaoClt, pendenciasEfetivacao } from "@/lib/dp/efetivacao-clt";

describe("efetivação para CLT", () => {
  it("freelancer → CLT é efetivação; CLT → CLT não", () => {
    expect(ehEfetivacaoClt("freelancer", "clt")).toBe(true);
    expect(ehEfetivacaoClt("clt", "clt")).toBe(false);
  });

  it("lista PIS e CTPS faltantes", () => {
    const p = pendenciasEfetivacao({ cpf: "1", rg_numero: "2" }).map((i) => i.campo);
    expect(p).toContain("pis_nit");
    expect(p).toContain("ctps_numero");
    expect(p).not.toContain("cpf");
  });

  it("reservista só é exigida para homens", () => {
    expect(pendenciasEfetivacao({ sexo: "F" }).map((i) => i.campo)).not.toContain("reservista");
    expect(pendenciasEfetivacao({ sexo: "M" }).map((i) => i.campo)).toContain("reservista");
  });
});
