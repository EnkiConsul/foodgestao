import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalculadoraDesligamento } from "../CalculadoraDesligamento";

afterEach(cleanup);
const preencher = () => {
  fireEvent.change(screen.getByLabelText("Data de admissão"), { target: { value: "2024-01-10" } });
  fireEvent.change(screen.getByLabelText("Comunicação (simulada)"), { target: { value: "2026-10-01" } });
};

describe("Atalho Registrar desligamento", () => {
  it("sem colaborador fica desabilitado e não chama nada", () => {
    const abrir = vi.fn();
    render(<CalculadoraDesligamento registrar={{ rotulo: "Registrar desligamento", bloqueio: "Selecione um colaborador", abrir }} />);
    preencher();
    const btn = screen.getByRole("button", { name: "Registrar desligamento" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(abrir).not.toHaveBeenCalled();
  });
  it("leva só decisões e datas simuladas sem folgas/saldo", () => {
    const abrir = vi.fn();
    render(<CalculadoraDesligamento registrar={{ rotulo: "Registrar desligamento", abrir }} />);
    preencher();
    fireEvent.change(screen.getByLabelText("Saldo do banco de horas"), { target: { value: "8" } });
    fireEvent.click(document.querySelector('[data-dia="2026-10-31"]') as HTMLButtonElement); // folga simulada
    fireEvent.click(screen.getByRole("button", { name: "Registrar desligamento" }));
    expect(abrir).toHaveBeenCalledTimes(1);
    const arg = abrir.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(["data_comunicacao", "modalidade", "reducao", "simulado"]);
    expect(arg).toEqual({ data_comunicacao: "2026-10-01", modalidade: "trabalhado", reducao: "duas_horas", simulado: { ultimo: "2026-10-31", prazo: "2026-11-10" } });
  });
});
