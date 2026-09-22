import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/lib/env/appEnv", () => ({
  isHomologacao: () => mockHom(),
}));

let hom = false;
const mockHom = () => hom;

import { ReclameAquiSeal } from "@/components/marketing/ReclameAquiSeal";

beforeEach(() => {
  hom = false;
});

afterEach(() => {
  cleanup();
  document.getElementById("ra-embed-verified-seal")?.remove();
});

describe("Selo do Reclame Aqui", () => {
  it("injeta o script oficial uma única vez no contêiner alvo", () => {
    const { container } = render(<ReclameAquiSeal />);
    const alvo = container.querySelector("#ra-verified-seal");
    expect(alvo).not.toBeNull();
    const scripts = alvo!.querySelectorAll("script#ra-embed-verified-seal");
    expect(scripts.length).toBe(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe("https://s3.amazonaws.com/raichu-beta/ra-verified/bundle.js");
    expect(script.getAttribute("data-target")).toBe("ra-verified-seal");
    expect(script.getAttribute("data-model")).toBe("compact_1");
    expect(script.getAttribute("data-id")).toBe("S3VsSmgwLTk3X1Jkalc3VDpyYXB0b3Itc3lzdGVt");
  });

  it("não renderiza nem injeta nada em homologação", () => {
    hom = true;
    const { container } = render(<ReclameAquiSeal />);
    expect(container.querySelector("#ra-verified-seal")).toBeNull();
    expect(document.getElementById("ra-embed-verified-seal")).toBeNull();
  });

  it("remove o script ao desmontar", () => {
    const { unmount } = render(<ReclameAquiSeal />);
    unmount();
    expect(document.getElementById("ra-embed-verified-seal")).toBeNull();
  });
});
