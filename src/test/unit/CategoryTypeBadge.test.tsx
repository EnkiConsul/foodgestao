import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";
import { categoryIndent } from "@/lib/categories/display";

describe("CategoryTypeBadge", () => {
  it("renderiza o rótulo Receita", () => {
    render(<CategoryTypeBadge type="receita" />);
    expect(screen.getByText("Receita")).toBeInTheDocument();
  });

  it("renderiza o rótulo Despesa", () => {
    render(<CategoryTypeBadge type="despesa" />);
    expect(screen.getByText("Despesa")).toBeInTheDocument();
  });

  it("aplica cores distintas por tipo", () => {
    const { container: receita } = render(<CategoryTypeBadge type="receita" />);
    const { container: despesa } = render(<CategoryTypeBadge type="despesa" />);
    expect(receita.firstElementChild?.className).toContain("emerald");
    expect(despesa.firstElementChild?.className).toContain("red");
  });

  it("aceita className adicional", () => {
    const { container } = render(<CategoryTypeBadge type="receita" className="ml-2" />);
    expect(container.firstElementChild?.className).toContain("ml-2");
  });

  it("mantém o mesmo rótulo em qualquer nível da hierarquia", () => {
    [0, 1, 2, 3, 4].forEach((depth) => {
      const { container } = render(
        <div style={{ paddingLeft: categoryIndent(depth) }}>
          <CategoryTypeBadge type={depth % 2 === 0 ? "receita" : "despesa"} />
        </div>,
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.style.paddingLeft).toBe(`${depth * 16}px`);
      expect(wrapper.textContent).toBe(depth % 2 === 0 ? "Receita" : "Despesa");
    });
  });

  it("não exibe numeração posicional", () => {
    const { container } = render(<CategoryTypeBadge type="despesa" />);
    expect(container.textContent).not.toMatch(/\d/);
  });
});
