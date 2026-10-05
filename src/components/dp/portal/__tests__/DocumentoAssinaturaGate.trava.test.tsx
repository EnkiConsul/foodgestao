import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * A trava do portal remove o "Ver depois" quando há muitos documentos parados
 * ou um documento muito antigo. Sem o botão "X" escondido, o diálogo continua
 * bloqueante, mas o "X" desenhado daria a impressão de botão quebrado.
 */

const pendentes = vi.hoisted(() => ({ current: [] as any[] }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => "colab-1"),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
      })),
    })),
  },
}));

vi.mock("@/hooks/portal/useDocumentosAguardandoAssinatura", () => ({
  useDocumentosAguardandoAssinatura: () => ({
    colaborador: { id: "colab-1", company_id: "c-1", nome: "Hanna Beatriz", nome_social: null },
    documentos: pendentes.current,
    isLoading: false,
  }),
}));

vi.mock("@/components/dp/AssinaturaCaptura", () => ({
  AssinaturaCaptura: () => <div data-testid="captura" />,
}));

vi.mock("@/components/dp/DocumentPreview", () => ({
  DocumentPreview: () => <div />,
}));

import { DocumentoAssinaturaGate } from "@/components/dp/portal/DocumentoAssinaturaGate";

function doc(diasAtraso: number) {
  return {
    id: `doc-${diasAtraso}-${Math.random()}`,
    titulo: "Termo de Ciência",
    tipo: "outros",
    tipo_label: "Documento",
    competencia_label: "10/2026",
    file_path: "dp-documentos/termo.pdf",
    file_name: "termo.pdf",
    mime_type: "application/pdf",
    created_at: new Date(Date.now() - diasAtraso * 86_400_000).toISOString(),
  };
}

const fechar = () => screen.queryByRole("button", { name: "Close" });

beforeEach(() => {
  pendentes.current = [];
});

describe("Trava de assinatura do portal", () => {
  it("esconde o botão X quando há 2 documentos pendentes", () => {
    pendentes.current = [doc(1), doc(2)];
    render(<DocumentoAssinaturaGate />);

    expect(screen.getByText("Documento para assinar")).toBeInTheDocument();
    expect(fechar()).toBeNull();
    expect(screen.queryByText("Ver depois")).toBeNull();
    expect(screen.getByText(/2 documentos sem assinatura/i)).toBeInTheDocument();
  });

  it("esconde o botão X quando o documento está há 7 dias ou mais sem assinatura", () => {
    pendentes.current = [doc(9)];
    render(<DocumentoAssinaturaGate />);

    expect(fechar()).toBeNull();
    expect(screen.queryByText("Ver depois")).toBeNull();
    expect(screen.getByText(/há 9 dias sem assinatura/i)).toBeInTheDocument();
  });

  it("mantém X e 'Ver depois' quando o alerta ainda é apenas um lembrete", () => {
    pendentes.current = [doc(1)];
    render(<DocumentoAssinaturaGate />);

    expect(fechar()).not.toBeNull();
    expect(screen.getByText("Ver depois")).toBeInTheDocument();
    expect(screen.queryByText(/sem assinatura\. Assine para continuar/i)).toBeNull();
  });
});
