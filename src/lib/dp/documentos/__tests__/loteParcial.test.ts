import { describe, expect, it } from "vitest";
import {
  indicesVisiveis, loteParcial, modoExibicaoInicial, podeConcluirIgnorando, primeiraPendente,
  proximaPendente, resumoLoteParcial, statusLoteAposDecisao, textoConclusao, textoSalvas,
} from "../lote-parcial";

const p = (id: string, status: string, colab: string | null = null) => ({ id, status, matched_colaborador_id: colab });

/** Caso Praianos: 46 páginas, 44 salvas, 2 sem cadastro (páginas 30 e 41). */
function praianos() {
  return Array.from({ length: 46 }, (_, i) =>
    i === 29 || i === 40 ? p(`p${i + 1}`, "pending") : p(`p${i + 1}`, "imported", `c${i}`),
  );
}

describe("lote de documentos parcialmente salvo", () => {
  it("resume 44 salvas e 2 sem cadastro como fase parcial", () => {
    const r = resumoLoteParcial(praianos());
    expect(r).toMatchObject({ total: 46, salvas: 44, prontas: 0, semSaida: 2, abertas: 2 });
    expect(loteParcial(r)).toBe(true);
    expect(podeConcluirIgnorando(r)).toBe(true);
  });

  it("abre na primeira página pendente, não na página 1 já salva", () => {
    expect(primeiraPendente(praianos())).toBe(29);
  });

  it("mostra só as 2 pendentes por padrão e todas as 46 ao pedir", () => {
    const rows = praianos();
    const modo = modoExibicaoInicial(resumoLoteParcial(rows));
    expect(modo).toBe("pendentes");
    expect(indicesVisiveis(rows, modo)).toEqual([29, 40]);
    expect(indicesVisiveis(rows, "todas")).toHaveLength(46);
  });

  it("lote sem nada salvo abre com todas as páginas", () => {
    const rows = [p("a", "pending", "c1"), p("b", "pending")];
    expect(modoExibicaoInicial(resumoLoteParcial(rows))).toBe("todas");
  });

  it("não oferece concluir ignorando enquanto há página pronta para salvar", () => {
    const r = resumoLoteParcial([p("a", "pending", "c1"), p("b", "pending"), p("c", "imported", "c2")]);
    expect(podeConcluirIgnorando(r)).toBe(false);
  });

  it("página com falha também pode ser ignorada para concluir", () => {
    const r = resumoLoteParcial([p("a", "imported", "c1"), p("b", "failed", "c2")]);
    expect(r.semSaida).toBe(1);
    expect(podeConcluirIgnorando(r)).toBe(true);
  });

  it("após ignorar as 2 restantes o lote fica concluído", () => {
    const rows = praianos().map((x) => (x.status === "pending" ? { ...x, status: "rejected" } : x));
    expect(statusLoteAposDecisao(rows)).toBe("imported");
    expect(textoConclusao(44, 2)).toBe("Lote concluído: 44 salvas e 2 ignoradas");
  });

  it("desfazer uma ignorada reabre o lote como parcial", () => {
    const rows = [p("a", "imported", "c1"), p("b", "pending")];
    expect(statusLoteAposDecisao(rows)).toBe("partially_imported");
    expect(statusLoteAposDecisao([p("a", "pending"), p("b", "rejected")])).toBe("ready");
  });

  it("avança para a próxima pendente e sinaliza quando não sobra nenhuma", () => {
    const rows = praianos();
    expect(proximaPendente(rows, 29)).toBe(40);
    expect(proximaPendente(rows, 40)).toBe(29);
    expect(proximaPendente(rows, 29, new Set(["p41"]))).toBe(-1);
  });

  it("textos no singular e no plural", () => {
    expect(textoSalvas(1)).toBe("1 página já foi salva");
    expect(textoSalvas(44)).toBe("44 páginas já foram salvas");
    expect(textoConclusao(1, 0)).toBe("Lote concluído: 1 salva");
  });
});
