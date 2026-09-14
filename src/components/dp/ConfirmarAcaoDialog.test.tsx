import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { ConfirmarAcaoDialog } from "./ConfirmarAcaoDialog";

describe("ConfirmarAcaoDialog", () => {
  const renderDialog = (onConfirm: () => void) =>
    render(
      <ConfirmarAcaoDialog
        titulo="Excluir documento?"
        descricao='"Contrato.pdf" será excluído e não poderá ser recuperado.'
        confirmar="Excluir"
        cancelar="Cancelar"
        onConfirm={onConfirm}
      >
        <Button aria-label="Excluir documento">Excluir</Button>
      </ConfirmarAcaoDialog>,
    );

  it("não executa a ação só porque o botão foi clicado", () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);
    fireEvent.click(screen.getByLabelText("Excluir documento"));
    expect(screen.getByText("Excluir documento?")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("executa a ação apenas após confirmar", () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);
    fireEvent.click(screen.getByLabelText("Excluir documento"));
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancelar não executa a ação", () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);
    fireEvent.click(screen.getByLabelText("Excluir documento"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
