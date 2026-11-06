import { describe, expect, it } from "vitest";
import { densidadeSegura } from "../pdf-densidade";

describe("densidade do canvas do PDF", () => {
  it("usa a densidade da tela quando cabe no limite", () => {
    expect(densidadeSegura(360, 510, 3)).toBe(3);
  });

  it("reduz no zoom alto para não passar de 16 milhões de pixels", () => {
    const d = densidadeSegura(1440, 2040, 3);
    expect(1440 * d * 2040 * d).toBeLessThanOrEqual(16_000_000);
    expect(d).toBeLessThan(3);
  });
});
