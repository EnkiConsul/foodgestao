import { describe, expect, it } from "vitest";
import {
  avisoForaDoPrazo, diasDeAntecedencia, selosAviso, validarRegistroAviso,
} from "@/lib/dp/ferias-aviso";

describe("aviso de férias", () => {
  it("conta a antecedência entre aviso e início", () => {
    expect(diasDeAntecedencia("2026-04-01", "2026-03-01")).toBe(31);
    expect(diasDeAntecedencia("2026-04-01", "2026-04-05")).toBe(-4);
  });

  it("marca fora do prazo abaixo de 30 dias", () => {
    expect(avisoForaDoPrazo("2026-04-01", "2026-03-01")).toBe(false);
    expect(avisoForaDoPrazo("2026-04-01", "2026-03-20")).toBe(true);
  });

  it("exige justificativa quando o aviso sai em cima da hora", () => {
    const r = validarRegistroAviso({
      dataInicio: "2026-04-01",
      avisoEm: "2026-03-20",
      hojeISO: "2026-03-20",
      declarouComunicacao: false,
      temAnexo: false,
      justificativa: "",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.motivo).toBe("justificativa");
  });

  it("registro retroativo exige declaração e anexo", () => {
    const semDeclaracao = validarRegistroAviso({
      dataInicio: "2026-06-01",
      avisoEm: "2026-04-10",
      hojeISO: "2026-04-20",
      declarouComunicacao: false,
      temAnexo: true,
      justificativa: "",
    });
    expect(semDeclaracao.ok).toBe(false);
    if (semDeclaracao.ok === false) expect(semDeclaracao.motivo).toBe("declaracao");

    const semAnexo = validarRegistroAviso({
      dataInicio: "2026-06-01",
      avisoEm: "2026-04-10",
      hojeISO: "2026-04-20",
      declarouComunicacao: true,
      temAnexo: false,
      justificativa: "",
    });
    expect(semAnexo.ok).toBe(false);
    if (semAnexo.ok === false) expect(semAnexo.motivo).toBe("anexo");

    const ok = validarRegistroAviso({
      dataInicio: "2026-06-01",
      avisoEm: "2026-04-10",
      hojeISO: "2026-04-20",
      declarouComunicacao: true,
      temAnexo: true,
      justificativa: "",
    });
    expect(ok.ok).toBe(true);
  });

  it("recusa data futura", () => {
    const r = validarRegistroAviso({
      dataInicio: "2026-06-01",
      avisoEm: "2026-04-30",
      hojeISO: "2026-04-20",
      declarouComunicacao: true,
      temAnexo: true,
      justificativa: "",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.motivo).toBe("futura");
  });

  it("mostra os selos do aviso", () => {
    expect(selosAviso({ data_inicio: "2026-06-01" })[0].chave).toBe("sem_aviso");
    const selos = selosAviso({
      data_inicio: "2026-06-01",
      aviso_em: "2026-05-20",
      aviso_fora_prazo: true,
      aviso_retroativo: true,
    }).map((s) => s.chave);
    expect(selos).toEqual(["fora_prazo", "retroativo", "aguardando_ciencia"]);
    const ciente = selosAviso({
      data_inicio: "2026-06-01",
      aviso_em: "2026-04-20",
      ciente_em: "2026-04-21T10:00:00Z",
    }).map((s) => s.chave);
    expect(ciente).toEqual(["ciente"]);
  });
});
