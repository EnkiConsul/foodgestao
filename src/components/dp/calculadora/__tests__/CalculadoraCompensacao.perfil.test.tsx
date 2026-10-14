import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalculadoraCompensacao } from "../CalculadoraCompensacao";

describe("10. Calculadora — gestor x colaborador", () => {
  it("colaborador não vê simulação de saldo negativo e nunca recebe sugestão negativa", () => {
    render(<CalculadoraCompensacao perfil="colaborador" />);
    expect(screen.queryByText("Simulação de saldo negativo")).toBeNull();
    expect(screen.queryByLabelText("Limite negativo")).toBeNull();
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "15" } });
    expect(screen.getByText("Melhor sugestão encontrada")).toBeTruthy();
    expect(screen.queryByText("Saldo negativo")).toBeNull();
  });
  it("gestor vê a simulação de saldo negativo e o resultado é sinalizado", () => {
    render(<CalculadoraCompensacao perfil="gestor" />);
    expect(screen.getByText("Simulação de saldo negativo")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText("Limite negativo"), { target: { value: "1" } });
    expect(screen.getAllByText("Saldo negativo").length).toBeGreaterThan(0);
  });
});
