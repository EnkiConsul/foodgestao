import { describe, it, expect } from "vitest";
import { situacaoPagamento, avisoEmAndamento, caminhoDesligamento, diasAtePrazo } from "@/lib/dp/desligamento-apresentacao";
import { rotuloFolga } from "@/lib/dp/folga-apresentacao";

describe("apresentação das compensações e do prazo rescisório", () => {
  it("contagem do prazo considera dias corridos", () => {
    expect(diasAtePrazo("2026-11-16", "2026-11-13")).toBe(3);
    expect(diasAtePrazo("2026-11-16", "2026-11-16")).toBe(0);
    expect(diasAtePrazo("2026-11-16", "2026-11-17")).toBe(-1);
  });
  it("compensação do aviso não vira extra por causa do registro legado", () => {
    expect(rotuloFolga({ tipo: "extra", extra: true, subtipo: "banco_horas_aviso" })).toBe("Folga compensatória (banco no aviso)");
  });
  it("compensação de feriado é identificada separadamente da extra", () => {
    expect(rotuloFolga({ tipo: "extra", subtipo: "compensacao_feriado" })).toBe("Folga compensatória (feriado)");
    expect(rotuloFolga({ tipo: "extra" })).toBe("Folga extra autorizada");
  });
  it("pagamento realizado não é vencido", () => {
    expect(situacaoPagamento({ prazo_10_dias: "2026-11-16", pagamento_status: "pago" }, "2026-11-17")).toBe("Pago");
  });
  it("dia final continua no prazo até o fim do dia", () => {
    expect(situacaoPagamento({ prazo_10_dias: "2026-11-16", pagamento_status: "pendente" }, "2026-11-16")).toBe("Vence hoje");
    expect(situacaoPagamento({ prazo_10_dias: "2026-11-16", pagamento_status: "pendente" }, "2026-11-17")).toBe("Prazo vencido");
  });
  it("processo em aviso abre o colaborador e não o identificador do processo", () => {
    expect(avisoEmAndamento("aviso_em_curso")).toBe(true);
    expect(avisoEmAndamento("efetivado")).toBe(false);
    expect(caminhoDesligamento("colaborador")).toBe("/dp/colaboradores?editar=colaborador&aba=desligamento");
  });
});