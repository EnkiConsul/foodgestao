import { describe, expect, it } from "vitest";
import {
  detalhesUsoTurno, estadoUsoTurno, motivoBloqueioExclusao, podeExcluirTurno,
  totalUsoTurno, TURNO_USO_VAZIO, type TurnoUsoRow,
} from "../turno-uso";

const uso = (over: Partial<TurnoUsoRow> = {}): TurnoUsoRow => ({
  turno_id: "t1",
  ...TURNO_USO_VAZIO,
  ...over,
});

describe("turno-uso", () => {
  it("soma todos os vínculos", () => {
    expect(totalUsoTurno(uso({ colaboradores_padrao: 2, escala_itens_publicados: 3 }))).toBe(5);
    expect(totalUsoTurno(null)).toBe(0);
  });

  it("classifica turno sem nenhum vínculo como sem uso e permite excluir", () => {
    const estado = estadoUsoTurno({ uso: uso() });
    expect(estado).toBe("sem_uso");
    expect(podeExcluirTurno(estado)).toBe(true);
    expect(motivoBloqueioExclusao(estado, uso())).toBeNull();
  });

  it("classifica turno com vínculo como em uso e bloqueia exclusão", () => {
    const row = uso({ convocacoes: 1 });
    const estado = estadoUsoTurno({ uso: row });
    expect(estado).toBe("em_uso");
    expect(podeExcluirTurno(estado)).toBe(false);
    expect(motivoBloqueioExclusao(estado, row)).toContain("Desative");
  });

  it("trata turno com versões derivadas como histórico", () => {
    expect(estadoUsoTurno({ uso: uso({ versoes: 1 }) })).toBe("versao_historica");
    expect(estadoUsoTurno({ uso: uso(), ehVersaoHistorica: true })).toBe("versao_historica");
  });

  it("mostra estado de carregando enquanto a consulta não retornou", () => {
    expect(estadoUsoTurno({ carregando: true })).toBe("carregando");
    expect(podeExcluirTurno("carregando")).toBe(false);
  });

  it("detalha apenas origens com quantidade", () => {
    const detalhes = detalhesUsoTurno(uso({ config_dias: 2, grade_dias: 1 }));
    expect(detalhes).toHaveLength(2);
    expect(detalhes.map((d) => d.quantidade)).toEqual([2, 1]);
  });
});
