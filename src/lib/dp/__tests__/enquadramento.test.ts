import { describe, expect, it } from "vitest";
import { limitarPanEnquadramento } from "../enquadramento";

describe("arrasto da foto", () => {
  it("retrato permite centralizar lateralmente no zoom mínimo", () => {
    expect(limitarPanEnquadramento({ x: 40, y: 0 }, { w: 300, h: 400 }, { w: 300, h: 400 }, true).x).toBe(40);
  });
  it("retrato mantém a guia coberta sem liberar arrasto ilimitado", () => {
    expect(limitarPanEnquadramento({ x: 1000, y: 1000 }, { w: 300, h: 400 }, { w: 300, h: 400 }, true)).toEqual({ x: 54, y: 0 });
  });
  it("documento preserva todas as bordas no zoom mínimo", () => {
    expect(limitarPanEnquadramento({ x: 40, y: 40 }, { w: 300, h: 400 }, { w: 300, h: 400 }, false)).toEqual({ x: 0, y: 0 });
  });
});