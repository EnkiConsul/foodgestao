import { describe, expect, it } from "vitest";
import { agruparPorTipo, compararUrgencia, urgenciaDe, type PendenciaLike } from "@/lib/dp/pendencias";

function p(over: Partial<PendenciaLike> & { id: string }): PendenciaLike {
  return {
    tipo: "Férias",
    titulo: "t",
    subtitulo: "s",
    url: "/",
    atrasoDias: 0,
    ...over,
  };
}

describe("urgência das pendências", () => {
  it("classifica risco de dobra como urgente mesmo dentro do prazo", () => {
    expect(urgenciaDe({ atrasoDias: -19, urgente: true })).toBe("urgente");
    expect(urgenciaDe({ atrasoDias: -19, urgente: false })).toBe("proxima");
    expect(urgenciaDe({ atrasoDias: 3, urgente: true })).toBe("atrasada");
  });

  it("ordena atrasados, depois urgentes, depois futuros", () => {
    const lista = [
      p({ id: "futuro", tipo: "Documentos", atrasoDias: -40, vencimento: "2026-10-20" }),
      p({ id: "urgente", atrasoDias: -19, urgente: true, vencimento: "2026-09-30" }),
      p({ id: "atrasado", tipo: "Documentos", atrasoDias: 31, vencimento: "2026-08-11" }),
    ];
    expect([...lista].sort(compararUrgencia).map((i) => i.id)).toEqual([
      "atrasado",
      "urgente",
      "futuro",
    ]);
  });

  it("conta urgentes no grupo e o coloca acima dos grupos sem urgência", () => {
    const grupos = agruparPorTipo([
      p({ id: "doc", tipo: "Documentos", atrasoDias: -40 }),
      p({ id: "ferias", tipo: "Férias", atrasoDias: -19, urgente: true }),
    ]);
    expect(grupos[0].tipo).toBe("Férias");
    expect(grupos[0].urgentes).toBe(1);
    expect(grupos[1].urgentes).toBe(0);
  });
});
