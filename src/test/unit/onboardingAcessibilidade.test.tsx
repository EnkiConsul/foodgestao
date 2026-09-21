/**
 * D4 — rótulos acessíveis na primeira etapa do cadastro inicial.
 * Garante que cada campo é encontrado pelo próprio rótulo, que os
 * obrigatórios se anunciam como tal e que o erro fica ligado ao campo.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StepEmpresa } from "@/components/onboarding/food/StepEmpresa";
import type { EmpresaFormData } from "@/pages/Onboarding";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

beforeAll(() => {
  // jsdom não implementa estas APIs usadas pelos componentes do Radix.
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  Element.prototype.scrollIntoView = vi.fn();
});

const VAZIO: EmpresaFormData = {
  nomeCompleto: "", cnpj: "", razaoSocial: "", nomeFantasia: "", segmentoId: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  telefoneEmpresa: "", whatsappEmpresa: "", emailEmpresa: "", aceitouLgpd: false,
};

function renderStep(errors: Partial<Record<keyof EmpresaFormData, string>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StepEmpresa
        data={VAZIO}
        update={() => {}}
        errors={errors}
        setCnpjPending={() => {}}
        cnpjInactive={false}
        setCnpjInactive={() => {}}
      />
    </QueryClientProvider>,
  );
}

const ROTULOS = [
  "Nome Completo", "CNPJ", "Razão Social", "Nome Fantasia", "Segmento",
  "CEP", "Rua / Avenida", "Número", "Complemento", "Bairro", "Cidade", "Estado \\(UF\\)",
  "Telefone", "WhatsApp", "E-mail",
];

const OBRIGATORIOS = [
  "Nome Completo", "CNPJ", "Razão Social", "Segmento",
  "CEP", "Rua / Avenida", "Número", "Bairro", "Cidade", "Estado \\(UF\\)",
  "WhatsApp", "E-mail",
];

describe("Cadastro inicial — acessibilidade dos campos", () => {
  it("todos os campos são encontrados pelo rótulo", () => {
    renderStep();
    for (const rotulo of ROTULOS) {
      expect(screen.getByLabelText(new RegExp(`^${rotulo}`, "i")), rotulo).toBeTruthy();
    }
  });

  it("os campos obrigatórios se anunciam como obrigatórios", () => {
    renderStep();
    for (const rotulo of OBRIGATORIOS) {
      const campo = screen.getByLabelText(new RegExp(`^${rotulo}`, "i"));
      expect(campo.getAttribute("aria-required"), rotulo).toBe("true");
    }
  });

  it("os campos opcionais não são marcados como obrigatórios", () => {
    renderStep();
    for (const rotulo of ["Nome Fantasia", "Complemento", "Telefone"]) {
      const campo = screen.getByLabelText(new RegExp(`^${rotulo}`, "i"));
      expect(campo.getAttribute("aria-required"), rotulo).toBeNull();
    }
  });

  it("o aceite dos termos é obrigatório e tem rótulo", () => {
    renderStep();
    const aceite = screen.getByLabelText(/Li e concordo/i);
    expect(aceite.getAttribute("aria-required")).toBe("true");
  });

  it("o erro é anunciado e ligado ao campo", () => {
    renderStep({
      nomeCompleto: "Informe seu nome completo.",
      emailEmpresa: "E-mail inválido.",
      cidade: "Informe a cidade.",
      aceitouLgpd: "Você precisa aceitar os Termos e a Política de Privacidade.",
    });

    const pares: [string, string][] = [
      ["Nome Completo", "Informe seu nome completo."],
      ["E-mail", "E-mail inválido."],
      ["Cidade", "Informe a cidade."],
      ["Li e concordo", "Você precisa aceitar os Termos e a Política de Privacidade."],
    ];

    for (const [rotulo, mensagem] of pares) {
      const campo = screen.getByLabelText(new RegExp(`^${rotulo}`, "i"));
      expect(campo.getAttribute("aria-invalid"), rotulo).toBe("true");
      const idErro = campo.getAttribute("aria-describedby");
      expect(idErro, rotulo).toBeTruthy();
      const erro = document.getElementById(String(idErro));
      expect(erro?.textContent, rotulo).toContain(mensagem);
      expect(erro?.getAttribute("role"), rotulo).toBe("alert");
    }
  });
});
