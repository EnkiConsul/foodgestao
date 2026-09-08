import { describe, expect, it } from "vitest";
import { corteFeriasPadrao } from "@/lib/dp/ferias-direito";

describe("corteFeriasPadrao", () => {
  it("usa o período aquisitivo encerrado no ano anterior", () => {
    // Ciclo 2024-03-10 → 2025-03-09 terminou em 2025 (ano anterior a 2026).
    expect(corteFeriasPadrao("2015-03-10", "2026-09-07")).toBe("2024-03-10");
  });

  it("não depende do aniversário já ter passado no ano", () => {
    expect(corteFeriasPadrao("2015-11-20", "2026-09-07")).toBe("2024-11-20");
  });

  it("trata aniversário em 1º de janeiro", () => {
    // Ciclo 2025-01-01 → 2025-12-31 termina no próprio ano de início.
    expect(corteFeriasPadrao("2015-01-01", "2026-09-07")).toBe("2025-01-01");
  });

  it("nunca fica antes da admissão", () => {
    expect(corteFeriasPadrao("2026-01-05", "2026-09-07")).toBe("2026-01-05");
    expect(corteFeriasPadrao("2025-05-22", "2026-09-07")).toBe("2025-05-22");
  });
});
