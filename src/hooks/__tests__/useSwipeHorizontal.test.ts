import { describe, it, expect } from "vitest";
import { direcaoSwipe } from "../useSwipeHorizontal";

describe("direcaoSwipe", () => {
  it("arrastar para a esquerda avança", () => expect(direcaoSwipe(-80, 10)).toBe("esquerda"));
  it("arrastar para a direita volta", () => expect(direcaoSwipe(80, 10)).toBe("direita"));
  it("ignora menos de 50px", () => expect(direcaoSwipe(40, 0)).toBeNull());
  it("ignora rolagem vertical", () => expect(direcaoSwipe(60, 50)).toBeNull());
});
