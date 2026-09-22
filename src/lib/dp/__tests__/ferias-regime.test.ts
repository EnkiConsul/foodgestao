import { describe, expect, it } from "vitest";
import { regimeTemFeriasLegais } from "../ferias-direito";

describe("regime com controle legal de férias", () => {
  it.each(["clt", "CLT", "intermitente", "temporario", "aprendiz"])(
    "mantém o controle para %s",
    (regime) => expect(regimeTemFeriasLegais(regime)).toBe(true),
  );

  it.each(["freelancer", "pj", "mei", "socio", null, undefined])(
    "não cobra férias legais para %s",
    (regime) => expect(regimeTemFeriasLegais(regime)).toBe(false),
  );
});