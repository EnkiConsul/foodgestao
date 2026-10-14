import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalculadoraCompensacao, ORIENTACAO_SALDO_COLABORADOR, type OrigemJornadas } from "../CalculadoraCompensacao";

const ok = (chave: string, minutos: number): OrigemJornadas => ({
  chave, estado: "ok", incompletos: [], jornadas: [{ nome: `J${chave}`, minutos, qtd: 3 }],
});

describe("Calculadora — jornadas do colaborador", () => {
  afterEach(cleanup);

  it("carrega as jornadas cadastradas como resumo, editáveis sob demanda", () => {
    render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 440)} />);
    expect(screen.getByText(/^3× 7h ?20/)).toBeTruthy();
    fireEvent.click(screen.getByText("Ajustar jornadas"));
    expect(screen.getByDisplayValue("Ja")).toBeTruthy();
    expect(screen.getByDisplayValue("7:20")).toBeTruthy();
    expect(screen.queryByDisplayValue("JORNADA A")).toBeNull();
  });

  it("trocar de colaborador mantém o saldo digitado", () => {
    const { rerender } = render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 480)} />);
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "16" } });
    rerender(<CalculadoraCompensacao perfil="gestor" origem={ok("b", 480)} />);
    expect((screen.getByLabelText("Saldo de horas") as HTMLInputElement).value).toBe("16");
    expect(screen.getByText("Resultado")).toBeTruthy();
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

  it("voltar ao modo manual mantém o saldo digitado", () => {
    const { rerender } = render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 480)} />);
    fireEvent.change(screen.getByLabelText("Saldo de horas"), { target: { value: "10" } });
    rerender(<CalculadoraCompensacao perfil="gestor" />);
    expect((screen.getByLabelText("Saldo de horas") as HTMLInputElement).value).toBe("10");
  });

  it("ajustar jornadas do cadastro avisa que é só da simulação", () => {
    render(<CalculadoraCompensacao perfil="gestor" origem={ok("a", 480)} />);
    fireEvent.click(screen.getByText("Ajustar jornadas"));
    expect(screen.getByText(/Ajuste só desta simulação/)).toBeTruthy();
  });
});
