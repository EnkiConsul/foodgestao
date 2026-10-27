import { describe, it, expect } from "vitest";
import { rotuloAfastamento } from "@/lib/dp/licencas";
describe("rótulo do afastamento pela duração", () => {
  it("15 dias é Atestado", () => expect(rotuloAfastamento("atestado", "2026-10-01", "2026-10-15")).toBe("Atestado"));
  it("16 dias é Licença INSS", () => expect(rotuloAfastamento("atestado", "2026-10-01", "2026-10-16")).toBe("Licença INSS"));
  it("licença legal mantém o nome", () => expect(rotuloAfastamento("licenca_maternidade", "2026-10-01", "2027-01-28")).toBe("Licença-maternidade"));
});
