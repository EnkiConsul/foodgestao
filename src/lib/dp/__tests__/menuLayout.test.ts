import { describe, expect, it } from "vitest";
import { Home, Users } from "lucide-react";
import type { DpNavSurface } from "@/config/dpNavigation";
import {
  applyMenuLayout,
  extractLayout,
  sanitizeLayout,
  type DpMenuLayout,
} from "@/lib/dp/menuLayout";

const surface: DpNavSurface = {
  home: { label: "Início", to: "/dp", icon: Home, end: true },
  direct: [],
  extraShortcuts: [],
  groups: [
    {
      id: "a",
      label: "A",
      icon: Users,
      matchPrefixes: ["/a"],
      items: [
        { label: "A1", to: "/a/1", icon: Users },
        { label: "A2", to: "/a/2", icon: Users },
        { label: "A3-novo", to: "/a/3", icon: Users },
      ],
    },
    {
      id: "b",
      label: "B",
      icon: Users,
      matchPrefixes: ["/b"],
      items: [{ label: "B1", to: "/b/1", icon: Users }],
    },
  ],
};

describe("menuLayout", () => {
  it("mantém o padrão quando não há layout", () => {
    expect(applyMenuLayout(surface, null).groups.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("reordena grupos e itens", () => {
    const layout: DpMenuLayout = {
      v: 1,
      groups: ["b", "a"],
      items: { a: ["/a/2", "/a/1"] },
    };
    const out = applyMenuLayout(surface, layout);
    expect(out.groups.map((g) => g.id)).toEqual(["b", "a"]);
    // item novo (/a/3) permanece e vai para o fim
    expect(out.groups[1].items.map((i) => i.to)).toEqual(["/a/2", "/a/1", "/a/3"]);
  });

  it("ignora grupos e rotas removidos", () => {
    const layout: DpMenuLayout = {
      v: 1,
      groups: ["z", "b", "a"],
      items: { a: ["/a/9", "/a/2"], z: ["/z/1"] },
    };
    expect(applyMenuLayout(surface, layout).groups.map((g) => g.id)).toEqual(["b", "a"]);
    expect(sanitizeLayout(surface, layout)).toEqual({
      v: 1,
      groups: ["b", "a"],
      items: { a: ["/a/2"] },
    });
  });

  it("extrai a ordem atual", () => {
    expect(extractLayout(surface)).toEqual({
      v: 1,
      groups: ["a", "b"],
      items: { a: ["/a/1", "/a/2", "/a/3"], b: ["/b/1"] },
    });
  });

  it("rejeita layout inválido", () => {
    expect(applyMenuLayout(surface, { v: 2 } as never).groups.map((g) => g.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
