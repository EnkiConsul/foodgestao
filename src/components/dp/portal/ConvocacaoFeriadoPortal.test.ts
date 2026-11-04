import { describe, expect, it } from "vitest";
import { dataDaChaveConvocacao } from "./ConvocacaoFeriadoPortal";
describe("dataDaChaveConvocacao", () => {
  it("lê a data da convocação do colaborador", () => expect(dataDaChaveConvocacao("feriado_conv:abc:2026-11-15")).toBe("2026-11-15"));
  it("ignora avisos do gestor", () => expect(dataDaChaveConvocacao("feriado_conv_gestor:u:2026-11-01")).toBeNull());
});
