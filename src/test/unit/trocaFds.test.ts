import { describe, expect, it } from "vitest";
import { podePedirTrocaFds, validarTrocaFds } from "@/lib/dp/troca-fds";

const hoje = new Date(2026, 8, 15); // terça, 15/09/2026
const base = { diasFixos: [0, 6], motivo: "Consulta médica", hoje };

describe("troca-fds", () => {
  it("só oferece troca a quem tem folga fixa", () => {
    expect(podePedirTrocaFds([])).toBe(false);
    expect(podePedirTrocaFds([0, 6])).toBe(true);
  });

  it("aceita folgar na quarta e trabalhar no sábado", () => {
    expect(
      validarTrocaFds({ ...base, diaFolga: new Date(2026, 8, 16), diaTrabalho: new Date(2026, 8, 19 + 0) }),
    ).toEqual([]);
  });

  it("recusa quando o dia oferecido não é folga fixa", () => {
    const erros = validarTrocaFds({
      ...base,
      diaFolga: new Date(2026, 8, 16),
      diaTrabalho: new Date(2026, 8, 17),
    });
    expect(erros[0]).toContain("folga fixa sua");
  });

  it("recusa quando o dia pedido já é folga fixa", () => {
    const erros = validarTrocaFds({
      ...base,
      diaFolga: new Date(2026, 8, 20),
      diaTrabalho: new Date(2026, 8, 19),
    });
    expect(erros.join(" ")).toContain("já é folga fixa");
  });

  it("recusa data passada e motivo vazio", () => {
    const erros = validarTrocaFds({
      ...base,
      motivo: "  ",
      diaFolga: new Date(2026, 8, 9),
      diaTrabalho: new Date(2026, 8, 19),
    });
    expect(erros.join(" ")).toContain("motivo");
    expect(erros.join(" ")).toContain("data passada");
  });
});
