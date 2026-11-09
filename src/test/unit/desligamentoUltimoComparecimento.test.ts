import { describe, expect, it } from "vitest";
import {
  mapaUltimoComparecimento,
  ultimoComparecimentoDoContrato,
  ultimoDiaNaEscala,
} from "@/lib/dp/operacao-panorama";

describe("saída da escala após desligamento", () => {
  it("processo efetivado mantém a saída no último comparecimento (25/10), não no fim legal (06/11)", () => {
    const mapa = mapaUltimoComparecimento([
      { colaborador_id: "rosangela", ultimo_comparecimento: "2026-10-25", dispensado_desde: null },
    ]);
    const ultimo = ultimoComparecimentoDoContrato(mapa.get("rosangela"), "2025-05-22");
    expect(ultimoDiaNaEscala("2026-11-06", ultimo)).toBe("2026-10-25");
  });

  it("vale o processo mais recente do colaborador", () => {
    const mapa = mapaUltimoComparecimento([
      { colaborador_id: "a", ultimo_comparecimento: "2026-10-25", dispensado_desde: null },
      { colaborador_id: "a", ultimo_comparecimento: "2025-01-10", dispensado_desde: null },
    ]);
    expect(mapa.get("a")).toBe("2026-10-25");
  });

  it("sem último comparecimento usa o dia anterior à dispensa", () => {
    const mapa = mapaUltimoComparecimento([
      { colaborador_id: "a", ultimo_comparecimento: null, dispensado_desde: "2026-11-01" },
    ]);
    expect(mapa.get("a")).toBe("2026-10-31");
  });

  it("processo de contrato anterior não tira recontratado da escala", () => {
    expect(ultimoComparecimentoDoContrato("2025-03-10", "2026-01-05")).toBeNull();
    expect(ultimoDiaNaEscala(null, ultimoComparecimentoDoContrato("2025-03-10", "2026-01-05"))).toBeNull();
  });
});
