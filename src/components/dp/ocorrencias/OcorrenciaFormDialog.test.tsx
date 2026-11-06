import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OcorrenciaFormDialog } from "./OcorrenciaFormDialog";

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) =>
    <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("@/components/dp/AssiduidadePergunta", async importOriginal => {
  const original = await importOriginal<typeof import("@/components/dp/AssiduidadePergunta")>();
  return { ...original, AssiduidadePergunta: vi.fn(() => null) };
});
import { AssiduidadePergunta } from "@/components/dp/AssiduidadePergunta";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function abrir() {
  const onSubmit = vi.fn();
  render(<OcorrenciaFormDialog open onOpenChange={vi.fn()} colaboradores={[{ id: "ficticio", nome: "Pessoa fictícia" }]} colaboradorInicial="ficticio" dataInicial="2026-11-06" onSubmit={onSubmit} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Motivo acolhido" } });
  return { onSubmit, selects: screen.getAllByRole("combobox") };
}

describe("classificação da ocorrência manual", () => {
  it("selecionar ausência justificada salva ausência justificada e usa seu evento de assiduidade", () => {
    const { onSubmit, selects } = abrir();
    fireEvent.change(selects[1], { target: { value: "ausencia_justificada" } });
    expect(vi.mocked(AssiduidadePergunta).mock.lastCall?.[0].evento).toBe("falta_justificada");
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tipo: "ausencia_justificada" }));
  });
  it("voltar para falta desfaz a classificação justificada", () => {
    const { onSubmit, selects } = abrir();
    fireEvent.change(selects[1], { target: { value: "ausencia_justificada" } });
    fireEvent.change(selects[1], { target: { value: "falta" } });
    expect(vi.mocked(AssiduidadePergunta).mock.lastCall?.[0].evento).toBe("falta");
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tipo: "falta" }));
  });
  it("a classificação explícita do gestor também atualiza o tipo salvo", () => {
    const { onSubmit, selects } = abrir();
    fireEvent.change(selects[2], { target: { value: "justificada" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tipo: "ausencia_justificada" }));
  });
});