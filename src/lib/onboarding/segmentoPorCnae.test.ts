import { describe, it, expect } from "vitest";
import { segmentoPorCnae } from "./segmentoPorCnae";
describe("segmentoPorCnae", () => {
  it("restaurante pelo CNAE 5611-2/01", () => expect(segmentoPorCnae("5611-2/01", "Rancho 330")).toBe("Restaurante"));
  it("pizzaria pelo nome em CNAE de alimentação", () => expect(segmentoPorCnae(5611201, "Pakerê Pizzaria")).toBe("Pizzaria"));
  it("lanchonete pelo CNAE 5611-2/03", () => expect(segmentoPorCnae("5611203")).toBe("Lanchonete"));
  it("sem certeza não sugere", () => expect(segmentoPorCnae("6201501", "Pizza Software")).toBeNull());
  it("sem CNAE não sugere", () => expect(segmentoPorCnae(null, "Pizzaria")).toBeNull());
});
