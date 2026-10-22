import { describe, it, expect } from "vitest";
import { validarTerminoNovoEmprego } from "../../../../supabase/functions/dp-desligamento-aviso/termino";

const ok = { tipo: "novo_emprego", data: "2026-10-20", aplicar_termino: true, pedido_dispensado_pelo_empregado: true,
  novo_emprego_comprovado: true, nota: "Pedido escrito em 19/10, comprovante no GED" };
describe("término por novo emprego exige provas explícitas", () => {
  it("aceita com as duas declarações, nota e data passada", () => expect(validarTerminoNovoEmprego(ok, "2026-10-22")).toBeNull());
  it("recusa sem pedido do empregado", () => expect(validarTerminoNovoEmprego({ ...ok, pedido_dispensado_pelo_empregado: undefined }, "2026-10-22")).not.toBeNull());
  it("recusa sem comprovação", () => expect(validarTerminoNovoEmprego({ ...ok, novo_emprego_comprovado: false }, "2026-10-22")).not.toBeNull());
  it("recusa nota curta", () => expect(validarTerminoNovoEmprego({ ...ok, nota: "ok" }, "2026-10-22")).not.toBeNull());
  it("recusa último dia futuro", () => expect(validarTerminoNovoEmprego(ok, "2026-10-19")).not.toBeNull());
  it("recusa outro tipo", () => expect(validarTerminoNovoEmprego({ ...ok, tipo: "outro" }, "2026-10-22")).not.toBeNull());
});
