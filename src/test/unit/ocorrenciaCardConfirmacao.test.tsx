import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OcorrenciaCard } from "@/components/dp/ocorrencias/OcorrenciaCard";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

afterEach(cleanup);
const base = {
  id: "ficticia", tipo: "esquecimento_marcacao", estado: "confirmada", origem: "colaborador",
  data_operacional: "2026-10-21", horario_real: "08:28:00", marcacao_alvo: "entrada",
  tratativa_ponto: true, tratativa_status: "pendente", analise_status: "pendente",
  impacta_assiduidade: "nao_se_aplica", impacta_ferias: "nao_se_aplica",
  colaborador: { nome: "Pessoa fictícia", possui_folha_ponto: true },
} as Ocorrencia;
function abrir(o: Ocorrencia) {
  const tratar = vi.fn();
  const analisar = vi.fn();
  render(<OcorrenciaCard ocorrencia={o} onTratativa={tratar} onAnalisar={analisar} onConfirmar={vi.fn()} onCancelar={vi.fn()} onImpacto={vi.fn()} />);
  return { tratar, analisar };
}
describe("ações de conferência por estado", () => {
  it("abre conferência de esquecimento pendente pelo único botão principal", () => {
    const { tratar, analisar } = abrir(base);
    fireEvent.click(screen.getByRole("button", { name: "Tratar ponto" }));
    expect(tratar).toHaveBeenCalledTimes(1);
    expect(analisar).not.toHaveBeenCalled();
  });
  it("não permite tratar nem analisar novamente uma marcação concluída mesmo com análise antiga pendente", () => {
    const { tratar, analisar } = abrir({ ...base, tratativa_status: "concluida", tratativa_decisao: "confirmada" });
    for (const button of screen.getAllByRole("button")) fireEvent.click(button);
    expect(tratar).not.toHaveBeenCalled();
    expect(analisar).not.toHaveBeenCalled();
  });
});