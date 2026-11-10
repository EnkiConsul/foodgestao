import { describe, expect, it } from "vitest";
import { trocasAbertasComColegas, type TrocaAberta } from "@/lib/dp/troca-oferta";

const eu = "eu-ficticio";
const colega = "colega-ficticia";
const outro = "outro-ficticio";
const troca = (t: Partial<TrocaAberta>): TrocaAberta => ({
  solicitante_id: eu, destino_id: colega, data_original: "2099-11-12", data_proposta: "2099-11-11", status: "pendente_colega", ...t,
});

describe("troca já enviada não volta a oferecer o botão Trocar", () => {
  it("marca a colega como aguardando no dia da folga dela", () => {
    expect(trocasAbertasComColegas([troca({})], eu, "2099-11-11").get(colega)).toBe("colega");
  });
  it("depois do aceite, aguarda o gestor", () => {
    expect(trocasAbertasComColegas([troca({ status: "pendente_gestor" })], eu, "2099-11-11").get(colega)).toBe("gestor");
  });
  it("proposta recebida de um colega também conta no dia oferecido por ele", () => {
    const t = troca({ solicitante_id: outro, destino_id: eu, data_original: "2099-11-15", data_proposta: "2099-11-14" });
    expect(trocasAbertasComColegas([t], eu, "2099-11-15").get(outro)).toBe("colega");
  });
  it("troca encerrada libera o botão de novo", () => {
    expect(trocasAbertasComColegas([troca({ status: "recusada" })], eu, "2099-11-11").size).toBe(0);
  });
  it("não marca outro dia nem trocas de outras pessoas", () => {
    expect(trocasAbertasComColegas([troca({})], eu, "2099-11-12").size).toBe(0);
    expect(trocasAbertasComColegas([troca({ solicitante_id: outro })], eu, "2099-11-11").size).toBe(0);
  });
});
