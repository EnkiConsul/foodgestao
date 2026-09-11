import { describe, expect, it } from "vitest";
import {
  alertaPendenciaFerias,
  nivelVencimentoPeriodo,
  periodosComAcumulo,
} from "../ferias-direito";

const base = {
  fimAquisitivo: "2025-09-30",
  limiteConcessivo: "2026-09-30",
  diasSaldo: 30,
  politica: "a_conceder" as const,
};

describe("acúmulo de períodos — janelas 180/90", () => {
  it("acompanha a 180 dias do prazo quando há segundo período", () => {
    const alerta = alertaPendenciaFerias({ ...base, hojeISO: "2026-05-01", acumulo: true });
    expect(alerta.titulo).toBe("Férias a conceder — acompanhar");
    expect(alerta.nivel).not.toBe("atencao");
  });

  it("vira risco de dobra a 90 dias do prazo", () => {
    const alerta = alertaPendenciaFerias({ ...base, hojeISO: "2026-07-15", acumulo: true });
    expect(alerta.nivel).toBe("atencao");
    expect(alerta.titulo).toBe("Férias a conceder — risco de dobra");
  });

  it("sem acúmulo mantém 30 dias para o risco", () => {
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-07-15" })).not.toBe("atencao");
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-09-20" })).toBe("atencao");
  });

  it("depois do prazo continua vencida", () => {
    const alerta = alertaPendenciaFerias({ ...base, hojeISO: "2026-10-05", acumulo: true });
    expect(alerta.nivel).toBe("vencido");
    expect(alerta.titulo).toBe("Férias vencidas — pagamento em dobro");
  });

  it("marca acúmulo só quando existe período aquisitivo posterior com saldo pendente", () => {
    const ids = periodosComAcumulo([
      { id: "p1", colaborador_id: "c1", inicio_aquisitivo: "2024-10-01", dias_saldo: 30 },
      { id: "p2", colaborador_id: "c1", inicio_aquisitivo: "2025-10-01", dias_saldo: 0 },
      { id: "p3", colaborador_id: "c2", inicio_aquisitivo: "2025-01-01", dias_saldo: 30 },
      { id: "p4", colaborador_id: "c3", inicio_aquisitivo: "2024-01-01", dias_saldo: 30, socio: true },
      { id: "p5", colaborador_id: "c3", inicio_aquisitivo: "2025-01-01", dias_saldo: 30, socio: true },
    ]);
    expect(ids.has("p1")).toBe(true);
    expect(ids.has("p2")).toBe(false);
    expect(ids.has("p3")).toBe(false);
    expect(ids.has("p4")).toBe(false);
  });
});
