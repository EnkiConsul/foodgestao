import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OcorrenciaTratativaDialog } from "@/components/dp/ocorrencias/OcorrenciaTratativaDialog";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

const ocorrencia = {
  id: "sintetica", tipo: "esquecimento_marcacao", estado: "confirmada",
  horario_real: "08:30:00", marcacao_alvo: "intervalo_retorno", tratativa_status: "concluida", tratativa_observacao: "Conferido",
  colaborador: { nome: "Pessoa fictícia", possui_folha_ponto: true },
} as Ocorrencia;
afterEach(cleanup);
function abrir() {
  const ajustar = vi.fn();
  render(<OcorrenciaTratativaDialog ocorrencia={ocorrencia} onOpenChange={vi.fn()} onSubmit={vi.fn()} onAjustarHorario={ajustar} />);
  return ajustar;
}
describe("ajuste de horário pelo gestor", () => {
  it("corrige retorno do intervalo para saída sem alterar o horário", () => {
    const ajustar = abrir();
    fireEvent.click(screen.getByRole("button", { name: /^Saída$/ }));
    fireEvent.change(screen.getByLabelText("Motivo do ajuste"), { target: { value: "Esquecimento na saída" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar ajuste" }));
    expect(ajustar).toHaveBeenCalledExactlyOnceWith({ horario: "08:30", observacao: "Esquecimento na saída", marcacaoAlvo: "saida" });
  });
  it("não envia ajuste sem alteração", () => {
    const ajustar = abrir();
    const salvar = screen.getByRole("button", { name: "Salvar ajuste" });
    expect(salvar).toBeDisabled();
    fireEvent.click(salvar);
    expect(ajustar).not.toHaveBeenCalled();
  });
  it("exige motivo com pelo menos três caracteres ao alterar horário", () => {
    const ajustar = abrir();
    fireEvent.change(screen.getByLabelText("Horário real apurado"), { target: { value: "08:45" } });
    fireEvent.change(screen.getByLabelText("Motivo do ajuste"), { target: { value: "ab" } });
    const salvar = screen.getByRole("button", { name: "Salvar ajuste" });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo do ajuste"), { target: { value: "  Conferência  " } });
    fireEvent.click(salvar);
    expect(ajustar).toHaveBeenCalledExactlyOnceWith({ horario: "08:45", observacao: "Conferência", marcacaoAlvo: "intervalo_retorno" });
  });
  it("permite corrigir somente a observação preservando o horário", () => {
    const ajustar = abrir();
    fireEvent.change(screen.getByLabelText("Motivo do ajuste"), { target: { value: "Nova conferência" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar ajuste" }));
    expect(ajustar).toHaveBeenCalledExactlyOnceWith({ horario: "08:30", observacao: "Nova conferência", marcacaoAlvo: "intervalo_retorno" });
  });
  it("não envia ajuste com horário vazio", () => {
    const ajustar = abrir();
    fireEvent.change(screen.getByLabelText("Horário real apurado"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Motivo do ajuste"), { target: { value: "Conferência nova" } });
    const salvar = screen.getByRole("button", { name: "Salvar ajuste" });
    expect(salvar).toBeDisabled();
    fireEvent.click(salvar);
    expect(ajustar).not.toHaveBeenCalled();
  });
});