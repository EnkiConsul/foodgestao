import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalculadoraCompensacao } from "../CalculadoraCompensacao";

describe("10. Calculadora — gestor x colaborador", () => {
  afterEach(cleanup);
  it("colaborador não vê simulação de saldo negativo e nunca recebe sugestão negativa", () => {
    render(<CalculadoraCompensacao perfil="colaborador" />);
    expect(screen.queryByText(/simulação de saldo negativo/i)).toBeNull();
    expect(screen.queryByLabelText("Limite negativo")).toBeNull();
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "15" } });
    expect(screen.getByText("Melhor sugestão encontrada")).toBeTruthy();
    expect(screen.queryByText("Saldo negativo")).toBeNull();
  });
  it("gestor vê a simulação de saldo negativo e o resultado é sinalizado", () => {
    render(<CalculadoraCompensacao perfil="gestor" />);
    expect(screen.getByText(/simulação de saldo negativo/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "15:40" } });
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getAllByText("Saldo negativo").length).toBeGreaterThan(0);
  });
});
