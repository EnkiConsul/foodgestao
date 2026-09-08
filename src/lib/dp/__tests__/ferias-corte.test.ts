import { describe, expect, it } from "vitest";
import { corteFeriasPadrao } from "@/lib/dp/ferias-direito";

describe("corteFeriasPadrao", () => {
  it("usa o início do último período aquisitivo completo", () => {
    // Aniversário 10/03 já passou em 2026 → o último ciclo completo começou em 2025.
    expect(corteFeriasPadrao("2015-03-10", "2026-09-07")).toBe("2025-03-10");
  });

  it("recua um ano a mais quando o aniversário ainda não chegou no ano", () => {
    expect(corteFeriasPadrao("2015-11-20", "2026-09-07")).toBe("2024-11-20");
  });

  it("nunca fica antes da admissão", () => {
    expect(corteFeriasPadrao("2026-01-05", "2026-09-07")).toBe("2026-01-05");
  });
});
