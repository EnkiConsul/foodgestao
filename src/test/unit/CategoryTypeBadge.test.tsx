import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";
import { categoryIndent } from "@/lib/categories/display";

describe("CategoryTypeBadge", () => {
  it("renderiza o rótulo Entrada", () => {
    render(<CategoryTypeBadge type="entrada" />);
    expect(screen.getByText("Entrada")).toBeInTheDocument();
  });

  it("renderiza o rótulo Saída", () => {
    render(<CategoryTypeBadge type="saida" />);
    expect(screen.getByText("Saída")).toBeInTheDocument();
  });

  it("aplica cores distintas por tipo", () => {
    const { container: receita } = render(<CategoryTypeBadge type="entrada" />);
    const { container: despesa } = render(<CategoryTypeBadge type="saida" />);
    expect(receita.firstElementChild?.className).toContain("emerald");
    expect(despesa.firstElementChild?.className).toContain("red");
  });

  it("aceita className adicional", () => {
    const { container } = render(<CategoryTypeBadge type="entrada" className="ml-2" />);
    expect(container.firstElementChild?.className).toContain("ml-2");
  });

  it("mantém o mesmo rótulo em qualquer nível da hierarquia", () => {
    [0, 1, 2, 3, 4].forEach((depth) => {
      const { container } = render(
        <div style={{ paddingLeft: categoryIndent(depth) }}>
          <CategoryTypeBadge type={depth % 2 === 0 ? "entrada" : "saida"} />
        </div>,
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.paddingLeft).toBe(`${depth * 16}px`);
      expect(wrapper.textContent).toBe(depth % 2 === 0 ? "Entrada" : "Saída");
    });
  });

  it("não exibe numeração posicional", () => {
    const { container } = render(<CategoryTypeBadge type="saida" />);
    expect(container.textContent).not.toMatch(/\d/);
  });
});
