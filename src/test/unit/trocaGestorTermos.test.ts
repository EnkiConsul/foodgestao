import { describe, expect, it } from "vitest";
import { participantesComTermo, type ParticipanteTermoTroca } from "@/lib/dp/troca-gestor";
import { termoTrocaGestorParagrafos } from "@/lib/dp/termo-troca-gestor";

const formal: ParticipanteTermoTroca = { colaborador_id: "hanna", nome: "Hanna Civil", formal: true, portal: true, data_original: "2026-10-29", data_nova: "2026-11-02", empresa: "Empresa" };
describe("termos individuais de troca do gestor", () => {
  it("Hanna recebe termo e pessoa sem vínculo não assina", () => {
    expect(participantesComTermo([formal, { ...formal, colaborador_id: "veronica", formal: false }]).map(p => p.colaborador_id)).toEqual(["hanna"]);
  });
  it("ausência de Portal não dispensa termo de quem tem vínculo", () => {
    expect(participantesComTermo([{ ...formal, portal: false }])).toHaveLength(1);
  });
  it("duas pessoas sem vínculo não recebem termos", () => {
    expect(participantesComTermo([{ ...formal, formal: false }, { ...formal, colaborador_id: "outro", formal: false }])).toEqual([]);
  });
  it("duas pessoas formais recebem documentos próprios", () => {
    expect(participantesComTermo([formal, { ...formal, colaborador_id: "outra" }]).map(p => p.colaborador_id)).toEqual(["hanna", "outra"]);
  });
  it("motivo interno não integra o termo individual nem identifica o colega", () => {
    const paragrafos = termoTrocaGestorParagrafos({ empresa: "Empresa", nome: "Hanna Civil", dataFixa: "2026-10-29", dataNova: "2026-11-02", origem: "empresa", folgaFixa: false, trocaEntrePessoas: true, motivo: "Troca com Verônica" });
    expect(paragrafos.join(" ")).not.toContain("Verônica");
  });
});