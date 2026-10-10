import { describe, it, expect } from "vitest";
import { ehSobDemanda } from "@/lib/dp/operacao-panorama";

describe("freelancer na rotina da loja", () => {
  it("freelancer mensalista faz parte da rotina (folga fixa aparece)", () => {
    expect(ehSobDemanda("freelancer", "mensalista")).toBe(false);
  });
  it("freelancer diarista só entra convocado", () => {
    expect(ehSobDemanda("freelancer", "diarista")).toBe(true);
  });
  it("intermitente só entra convocado", () => {
    expect(ehSobDemanda("intermitente", "mensalista")).toBe(true);
  });
});
