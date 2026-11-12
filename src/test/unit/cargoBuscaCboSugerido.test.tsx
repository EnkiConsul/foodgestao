import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CargoBuscaSelect } from "@/components/dp/ficha-registro/CargoBuscaSelect";

// cmdk mede a lista; o jsdom não tem ResizeObserver nem scrollIntoView.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const base = { cargos: [{ id: "1", nome: "GARÇOM" }], value: null, onChange: () => {}, onCriar: () => {} };

describe("CargoBuscaSelect: CBO sugerido no cadastro rápido", () => {
  it("mostra o CBO lido quando o cargo a cadastrar é o nome lido da ficha", () => {
    render(<CargoBuscaSelect {...base} nomeLido="Cumim" cboLido="513425" />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("CBO sugerido: 513425")).toBeTruthy();
  });
  it("não leva o CBO quando a pessoa digita outro nome", () => {
    render(<CargoBuscaSelect {...base} nomeLido="Cumim" cboLido="513425" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText(/Buscar entre/), { target: { value: "Auxiliar de salão" } });
    expect(screen.getByText(/Cadastrar “AUXILIAR DE SALÃO”/)).toBeTruthy();
    expect(screen.queryByText(/CBO sugerido/)).toBeNull();
  });
});
