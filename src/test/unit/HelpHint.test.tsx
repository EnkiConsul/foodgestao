import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HelpHint } from "@/components/ui/help-hint";
import { HELP_CONTENT } from "@/content/help/helpContent";
import { HELP_BY_ROUTE, resolveHelpForPath } from "@/content/help/helpRoutes";

describe("HelpHint — ajuda contextual", () => {
  it("expõe nome acessível com o nome da funcionalidade", () => {
    render(<HelpHint helpKey="financeiro.lancamentos" />);
    const botao = screen.getByRole("button", {
      name: `Ajuda sobre ${HELP_CONTENT["financeiro.lancamentos"].titulo}`,
    });
    expect(botao).toHaveAttribute("type", "button");
  });

  it("abre no hover do mouse e fecha ao sair o ponteiro", async () => {
    const user = userEvent.setup();
    render(<HelpHint helpKey="financeiro.conta.tipo" />);
    const botao = screen.getByRole("button");

    await user.hover(botao);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      HELP_CONTENT["financeiro.conta.tipo"].texto,
    );

    await user.unhover(botao);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("abre pelo foco de teclado e fecha ao perder o foco", async () => {
    const user = userEvent.setup();
    render(
      <>
        <HelpHint helpKey="dp.colaboradores" />
        <button type="button">Outro</button>
      </>,
    );
    await user.tab();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.tab();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("abre pelo clique/toque e fecha no segundo clique", async () => {
    const user = userEvent.setup();
    render(<HelpHint helpKey="portal.escala" />);
    const botao = screen.getByRole("button");

    await user.click(botao);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.click(botao);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("fecha no Escape e não reabre enquanto o foco continuar no ícone", async () => {
    const user = userEvent.setup();
    render(<HelpHint helpKey="admin.auditoria" />);
    const botao = screen.getByRole("button");

    await user.click(botao);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    botao.focus();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("não submete formulário nem dispara ação do elemento pai", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onClickPai = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <div onClick={onClickPai}>
          <HelpHint helpKey="financeiro.lancamento.vencimento" />
        </div>
      </form>,
    );

    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClickPai).not.toHaveBeenCalled();
  });

  it("não renderiza conteúdo interativo dentro da ajuda", async () => {
    const user = userEvent.setup();
    render(<HelpHint helpKey="financeiro.conciliacao" />);
    await user.click(screen.getByRole("button"));
    const conteudo = await screen.findByRole("tooltip");
    expect(conteudo.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
  });

  it("não renderiza nada sem chave nem texto", () => {
    const { container } = render(<HelpHint />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Conteúdo de ajuda", () => {
  it("todos os textos são curtos, em PT-BR e não repetem apenas o rótulo", () => {
    for (const [chave, entrada] of Object.entries(HELP_CONTENT)) {
      expect(entrada.titulo.length, chave).toBeGreaterThan(2);
      expect(entrada.texto.length, chave).toBeGreaterThan(30);
      expect(entrada.texto.length, chave).toBeLessThanOrEqual(240);
      expect(entrada.texto.trim(), chave).not.toBe(entrada.titulo.trim());
    }
  });

  it("todas as rotas mapeadas apontam para chaves existentes", () => {
    for (const [rota, chave] of Object.entries(HELP_BY_ROUTE)) {
      expect(HELP_CONTENT[chave], rota).toBeTruthy();
    }
  });

  it("resolve ajuda por rota exata e por prefixo mais específico", () => {
    expect(resolveHelpForPath("/lancamentos")).toBe(HELP_BY_ROUTE["/lancamentos"]);
    expect(resolveHelpForPath("/dp/colaboradores/qualquer-id")).toBeTruthy();
    expect(resolveHelpForPath("/rota-inexistente-xyz")).toBeUndefined();
  });
});
