import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalculadoraCompensacao, ORIENTACAO_SALDO_COLABORADOR, type OrigemJornadas } from "../CalculadoraCompensacao";

const ok = (chave: string, minutos: number): OrigemJornadas => ({
  chave, estado: "ok", incompletos: [], jornadas: [{ nome: `J${chave}`, minutos, qtd: 3 }],
});

describe("Calculadora — jornadas do colaborador", () => {
  afterEach(cleanup);

  it("carrega as jornadas cadastradas no lugar das de exemplo", () => {
    render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 440)} />);
    expect(screen.getByDisplayValue("JA")).toBeTruthy();
    expect(screen.getByDisplayValue("7:20")).toBeTruthy();
    expect(screen.queryByDisplayValue("JORNADA A")).toBeNull();
  });

  it("trocar de colaborador limpa o saldo e os resultados", () => {
    const { rerender } = render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 480)} />);
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "16" } });
    expect(screen.getByText("Resultado")).toBeTruthy();
    rerender(<CalculadoraCompensacao perfil="gestor" origem={ok("b", 480)} />);
    expect((screen.getByLabelText("Saldo de horas") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Resultado")).toBeNull();
  });

  it("sem configuração não inventa jornadas", () => {
    render(<CalculadoraCompensacao perfil="gestor" origem={{ chave: "x", estado: "sem_config", jornadas: [], incompletos: [] }} />);
    expect(screen.getByText(/Não há configuração de trabalho vigente/)).toBeTruthy();
    expect(screen.queryByDisplayValue("JORNADA A")).toBeNull();
    expect(screen.queryAllByLabelText("Remover jornada")).toHaveLength(0);
  });

  it("dias sem horário são avisados", () => {
    render(<CalculadoraCompensacao perfil="gestor" origem={{ ...ok("a", 480), incompletos: [3] }} />);
    expect(screen.getByText(/Sem horário cadastrado em: QUA/)).toBeTruthy();
  });

  it("voltar ao modo manual restaura as jornadas de exemplo", () => {
    const { rerender } = render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 480)} />);
    rerender(<CalculadoraCompensacao perfil="gestor" />);
    expect(screen.getByDisplayValue("JORNADA A")).toBeTruthy();
  });

  it("colaborador vê a orientação do saldo, sem aba Desligamento e sem saldo negativo", () => {
    render(<CalculadoraCompensacao perfil="colaborador" origem={ok("eu", 480)} />);
    expect(screen.getByText(ORIENTACAO_SALDO_COLABORADOR)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Desligamento" })).toBeNull();
    expect(screen.queryByText(/simulação de saldo negativo/i)).toBeNull();
  });

  it("gestor não vê a orientação do colaborador", () => {
    render(<CalculadoraCompensacao perfil="gestor" />);
    expect(screen.queryByText(ORIENTACAO_SALDO_COLABORADOR)).toBeNull();
  });
});
