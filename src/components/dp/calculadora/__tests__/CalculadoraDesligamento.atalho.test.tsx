import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CalculadoraDesligamento } from "../CalculadoraDesligamento";

afterEach(cleanup);
const preencher = () => {
  fireEvent.change(screen.getByLabelText("Data de admissão"), { target: { value: "2024-01-10" } });
  fireEvent.change(screen.getByLabelText("Data da comunicação"), { target: { value: "2026-10-01" } });
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
  it("leva decisões, saldo e folgas para conferência oficial", () => {
    const abrir = vi.fn();
    render(<CalculadoraDesligamento registrar={{ rotulo: "Registrar desligamento", abrir }} />);
    preencher();
    fireEvent.change(screen.getByLabelText("Saldo do banco de horas"), { target: { value: "8" } });
    fireEvent.click(document.querySelector('[data-dia="2026-10-31"]') as HTMLButtonElement); // folga simulada
    fireEvent.click(screen.getByRole("button", { name: "Registrar desligamento" }));
    expect(abrir).toHaveBeenCalledTimes(1);
    const arg = abrir.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(["data_comunicacao", "data_termino_acordada", "descontar_aviso", "folgas_compensatorias", "modalidade", "motivo", "reducao", "saldo_banco_minutos", "simulado"]);
    expect(arg.motivo).toBe("dispensa_sem_justa_causa");
    // Referência = cenário simulado COM a folga escolhida (último dia antecipado), sem levar folgas/saldo.
    expect(arg.data_comunicacao).toBe("2026-10-01");
    expect(arg.saldo_banco_minutos).toBe(480);
    expect(arg.folgas_compensatorias).toEqual(["2026-10-31"]);
    expect(arg.simulado.comFolgas).toBe(true);
    expect(arg.simulado.ultimo).not.toBe("2026-10-31");
    expect(arg.simulado.ultimo < "2026-10-31").toBe(true);
    expect(Object.keys(arg.simulado).sort()).toEqual(["comFolgas", "prazo", "ultimo"]);
  });
});
