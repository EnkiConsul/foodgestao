import { describe, expect, it } from "vitest";
import { conferirValor, fraseConferenciaValor } from "@/lib/dp/comprovante-valor";

describe("conferirValor", () => {
  it("exato quando conta + dinheiro batem", () => {
    const c = conferirValor(70000, 50000, 20000);
    expect(c.status).toBe("exato");
    expect(fraseConferenciaValor(c)).toContain("Valor confere");
  });
  it("menor mostra quanto falta", () => {
    const c = conferirValor(150000, 35000, null);
    expect(c.status).toBe("menor");
    expect(c.diferencaCents).toBe(-115000);
    expect(fraseConferenciaValor(c)).toContain("Faltam");
  });
  it("maior mostra excedente", () => {
    expect(conferirValor(70000, 80000, 0).status).toBe("maior");
  });
  it("sem referência quando documento não tem valor", () => {
    expect(conferirValor(null, 70000, 0).status).toBe("sem_referencia");
    expect(conferirValor(70000, null, null).status).toBe("sem_referencia");
  });
});
