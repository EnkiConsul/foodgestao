import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { CalculadoraCompensacao } from "../CalculadoraCompensacao";
import { CalculadoraDesligamento } from "../CalculadoraDesligamento";

afterEach(cleanup);

function preencher(adm = "2024-01-10", com = "2026-10-01") {
  fireEvent.change(screen.getByLabelText("Data de admissão"), { target: { value: adm } });
  fireEvent.change(screen.getByLabelText("Data da comunicação"), { target: { value: com } });
}
const ultimo = () => screen.getByTestId("ultimo-comparecimento").textContent;
const dia = (iso: string) => document.querySelector(`[data-dia="${iso}"]`) as HTMLButtonElement;

describe("Calculadora — abas por perfil", () => {
  it("gestor vê Folga Compensatória e Desligamento", () => {
    render(<CalculadoraCompensacao perfil="gestor" />);
    expect(screen.getByRole("tab", { name: "Folga Compensatória" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Desligamento" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByText(/Prazos & Rescisão/)).toBeNull();
  });
  it("colaborador não tem a aba nem o conteúdo de Desligamento", () => {
    const { container } = render(<CalculadoraCompensacao perfil="colaborador" />);
    expect(screen.queryByRole("tab", { name: "Desligamento" })).toBeNull();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Folga Compensatória"]);
    expect(container.innerHTML).not.toMatch(/desligamento|aviso prévio|comparecimento|férias/i);
    expect(screen.getByLabelText("Saldo de horas")).toBeTruthy();
  });
});

describe("Saldo do banco de horas na aba Desligamento", () => {
  const saldo = (v: string) => fireEvent.change(screen.getByLabelText("Saldo do banco de horas"), { target: { value: v } });
  it("negativo mostra erro e não simula com zero", () => {
    render(<CalculadoraDesligamento />);
    preencher(); saldo("-8");
    expect(screen.getByRole("alert").textContent).toMatch(/positivo/);
    expect(screen.queryByTestId("ultimo-comparecimento")).toBeNull();
    expect(screen.getByText(/Corrija o saldo/)).toBeTruthy();
  });
  it("inválido mostra erro e não simula", () => {
    render(<CalculadoraDesligamento />);
    preencher(); saldo("abc");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("ultimo-comparecimento")).toBeNull();
  });
  it("vazio e zero simulam normalmente", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    expect(ultimo()).toContain("31/10/2026");
    saldo("0");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(ultimo()).toContain("31/10/2026");
    expect((screen.getByText("Concentrar no final") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Aba Desligamento", () => {
  it("trabalhado com 2h: último comparecimento é a última jornada do calendário", () => {
    render(<CalculadoraDesligamento />);
    preencher(); // 2 anos → 36 dias; cumpre 30: 02/10 a 31/10/2026 (sáb, 4h-2h)
    expect(ultimo()).toContain("31/10/2026");
    expect(dia("2026-10-04").dataset.classe).toBe("folga_regular"); // domingo
  });
  it("indenizado: dispensa de comparecimento, sem data inventada", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    fireEvent.click(screen.getByLabelText("Indenizado"));
    expect(ultimo()).toMatch(/Dispensado de comparecer a partir de 02\/10\/2026/);
    expect(screen.queryByLabelText("Calendário do aviso")).toBeNull();
  });
  it("prazo mostra o 10º dia bruto e sugestão anterior só como linha secundária", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    expect(screen.getByTestId("prazo-quitacao").textContent).toContain("10/11/2026");
    expect(screen.queryByTestId("sugestao-pagamento")).toBeNull();
    fireEvent.click(screen.getByLabelText("Indenizado")); // 01/10 + 10 = dom 11/10
    expect(screen.getByTestId("prazo-quitacao").textContent).toContain("11/10/2026");
    expect(screen.getByTestId("sugestao-pagamento").textContent).toMatch(/Sugestão para a empresa: pagar até 09\/10\/2026/);
    expect(document.body.textContent).not.toMatch(/prorroga/i);
  });
  it("7 dias corridos: ausência legal no final, separada das folgas", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    fireEvent.click(screen.getByLabelText("7 dias corridos no final"));
    expect(dia("2026-10-31").dataset.classe).toBe("ausencia_legal_aviso");
    expect(dia("2026-10-31").disabled).toBe(true);
    expect(ultimo()).toContain("24/10/2026");
  });
  it("incluir e excluir folga muda o último dia; saldo insuficiente é rejeitado", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    fireEvent.change(screen.getByLabelText("Saldo do banco de horas"), { target: { value: "8" } });
    fireEvent.click(dia("2026-10-31")); // sábado 2h
    expect(ultimo()).toContain("30/10/2026");
    expect(screen.getByText(/Sem compensação seria 31\/10\/2026/)).toBeTruthy();
    fireEvent.click(dia("2026-10-30")); // 6h, saldo 6h restante → aceita
    expect(ultimo()).toContain("29/10/2026");
    fireEvent.click(dia("2026-10-29")); // 6h, saldo 0 → rejeita
    expect(screen.getByText(/saldo insuficiente/)).toBeTruthy();
    fireEvent.click(dia("2026-10-31")); // desfaz
    fireEvent.click(dia("2026-10-29")); // desfaz a rejeitada
    expect(ultimo()).toContain("31/10/2026");
  });
  it("concentrar no final usa as últimas jornadas sem dupla contagem", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    fireEvent.change(screen.getByLabelText("Saldo do banco de horas"), { target: { value: "14" } });
    fireEvent.click(screen.getByText("Concentrar no final"));
    // 31/10 (2h) + 30/10 (6h) + 29/10 (6h) = 14h
    expect(ultimo()).toContain("28/10/2026");
    const cen = screen.getByText("Com compensação").parentElement!;
    expect(within(cen).getByText("0h")).toBeTruthy();
  });
  it("feriado e jornada variável viram dia sem expediente", () => {
    render(<CalculadoraDesligamento />);
    preencher();
    fireEvent.change(screen.getByLabelText("Jornada Sáb"), { target: { value: "0" } });
    expect(ultimo()).toContain("30/10/2026");
    fireEvent.change(screen.getByLabelText("Novo feriado"), { target: { value: "2026-10-30" } });
    fireEvent.click(screen.getByLabelText("Adicionar feriado"));
    expect(dia("2026-10-30").dataset.classe).toBe("folga_regular");
    expect(ultimo()).toContain("29/10/2026");
  });
});
