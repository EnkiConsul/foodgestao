import { describe, expect, it } from "vitest";
import { mapModeloHorario } from "@/hooks/useDpModelosHorario";

const linha = (dias: any[]) => ({
  id: "cfg-1",
  colaborador_id: "colab-1",
  unidade_id: "uni-1",
  turno_padrao_id: "turno-base",
  folga_variavel: false,
  folga_fixa_dow: 0,
  vigencia_inicio: "2026-01-01",
  updated_at: "2026-01-10",
  colaborador: { nome: "Cristiane Souza", cargo: "Atendente", cargo_id: "cargo-1", ativo: true },
  turno: { entrada: "08:00:00", saida: "17:00:00", intervalo_minutos: 60 },
  dias,
});

describe("mapModeloHorario", () => {
  it("usa o horário do turno da loja vinculado ao dia", () => {
    const m = mapModeloHorario(linha([
      { dow: 5, trabalha: true, turno_id: "turno-sexta", entrada: null, saida: null, intervalo_minutos: null,
        turno: { entrada: "12:00:00", saida: "22:00:00", intervalo_minutos: 30 } },
    ]));
    const sexta = m.dias.find((d) => d.dow === 5)!;
    expect(sexta.entrada).toBe("12:00");
    expect(sexta.saida).toBe("22:00");
    expect(sexta.intervalo_minutos).toBe(30);
    // O turno é da unidade de origem: só o horário viaja na cópia.
    expect(sexta.turno_id).toBeNull();
  });

  it("mantém o horário próprio do dia acima do turno", () => {
    const m = mapModeloHorario(linha([
      { dow: 6, trabalha: true, turno_id: "turno-sabado", entrada: "10:00:00", saida: "20:00:00", intervalo_minutos: 60,
        turno: { entrada: "12:00:00", saida: "22:00:00", intervalo_minutos: 30 } },
    ]));
    const sabado = m.dias.find((d) => d.dow === 6)!;
    expect(sabado.entrada).toBe("10:00");
    expect(sabado.saida).toBe("20:00");
  });

  it("aplica a folga fixa e o horário base", () => {
    const m = mapModeloHorario(linha([{ dow: 0, trabalha: true, turno_id: null }]));
    expect(m.dias.find((d) => d.dow === 0)!.trabalha).toBe(false);
    expect(m.horario).toEqual({ entrada: "08:00", saida: "17:00", intervalo_minutos: 60 });
  });
});
