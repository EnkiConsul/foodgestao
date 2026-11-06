import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OcorrenciaFormDialog } from "./OcorrenciaFormDialog";

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) =>
    <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
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

function abrir(props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <OcorrenciaFormDialog
      open
      onOpenChange={vi.fn()}
      colaboradores={[{ id: "ficticio", nome: "Pessoa fictícia" }]}
      colaboradorInicial="ficticio"
      dataInicial="2026-11-06"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Motivo acolhido" } });
  return { onSubmit, tipoSelect: screen.getAllByRole("combobox")[1] };
}

describe("classificação da ocorrência manual", () => {
  it("selecionar ausência justificada salva ausência justificada e usa seu evento de assiduidade", () => {
    const { onSubmit, tipoSelect } = abrir();
    fireEvent.change(tipoSelect, { target: { value: "ausencia_justificada" } });
    expect(vi.mocked(AssiduidadePergunta).mock.lastCall?.[0].evento).toBe("falta_justificada");
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tipo: "ausencia_justificada" }));
  });
  it("voltar para falta desfaz a classificação justificada", () => {
    const { onSubmit, tipoSelect } = abrir();
    fireEvent.change(tipoSelect, { target: { value: "ausencia_justificada" } });
    fireEvent.change(tipoSelect, { target: { value: "falta" } });
    expect(vi.mocked(AssiduidadePergunta).mock.lastCall?.[0].evento).toBe("falta");
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tipo: "falta" }));
  });
  it("a escolha do gestor no seletor único define o tipo salvo", () => {
    const { onSubmit, tipoSelect } = abrir();
    fireEvent.change(tipoSelect, { target: { value: "ausencia_justificada" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tipo: "ausencia_justificada" }));
  });
  it("a tela de falta só oferece as duas classificações, sem previsão ou atestado", () => {
    abrir({ somenteFalta: true });
    expect(screen.getByRole("option", { name: "Falta justificada" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Falta injustificada" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Previsão de falta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Atestado" })).not.toBeInTheDocument();
  });
});
