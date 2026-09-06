import { describe, it, expect } from "vitest";
import { primeiroDiaDoMes, ultimoDiaDoMes } from "../competencia";

describe("ultimoDiaDoMes", () => {
  it("meses de 31 dias", () => {
    expect(ultimoDiaDoMes("2026-01")).toBe("2026-01-31");
    expect(ultimoDiaDoMes("2026-12")).toBe("2026-12-31");
  });

  it("meses de 30 dias", () => {
    expect(ultimoDiaDoMes("2026-09")).toBe("2026-09-30");
    expect(ultimoDiaDoMes("2026-04")).toBe("2026-04-30");
    expect(ultimoDiaDoMes("2026-06")).toBe("2026-06-30");
    expect(ultimoDiaDoMes("2026-11")).toBe("2026-11-30");
  });

  it("fevereiro comum e bissexto", () => {
    expect(ultimoDiaDoMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2024-02")).toBe("2024-02-29");
  });

  it("entrada inválida volta como recebida", () => {
    expect(ultimoDiaDoMes("")).toBe("");
    expect(ultimoDiaDoMes("2026-13")).toBe("2026-13");
  });

  it("primeiro dia", () => {
    expect(primeiroDiaDoMes("2026-09")).toBe("2026-09-01");
  });
});
