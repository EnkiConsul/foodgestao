import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Tela cheia de leitura e assinatura: o botão final só libera com a
 * assinatura feita. Documento de página única (imagem) não pede rubrica;
 * a exigência página a página de documentos longos está coberta em
 * src/lib/dp/__tests__/rubrica.test.ts.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://x/doc.png" }, error: null })),
      }),
    },
  },
}));

const captura = vi.hoisted(() => ({ emitir: null as ((png: string | null) => void) | null }));
vi.mock("@/components/dp/AssinaturaCaptura", () => ({
  AssinaturaCaptura: ({ onChange }: { onChange: (png: string | null) => void }) => {
    captura.emitir = onChange;
    return <div data-testid="captura" />;
  },
}));

vi.mock("@/components/dp/ImagemZoomViewer", () => ({
  ImagemZoomViewer: () => <div data-testid="imagem" />,
}));

import { DocumentoAssinarViewer } from "@/components/dp/portal/DocumentoAssinarViewer";

const PNG = "data:image/png;base64,AA";

function abrir(onConcluir = vi.fn()) {
  render(
    <DocumentoAssinarViewer
      open
      onOpenChange={() => undefined}
      titulo="Termo de Ciência"
      filePath="c1/colab1/termo.png"
      fileName="termo.png"
      mimeType="image/png"
      nomeColaborador="Hanna Beatriz"
      onConcluir={onConcluir}
    />,
  );
  return onConcluir;
}

beforeEach(() => {
  captura.emitir = null;
});

describe("Tela de leitura e assinatura", () => {
  it("começa com o botão final travado até a assinatura existir", async () => {
    abrir();
    const concluir = screen.getByRole("button", { name: /Concluir e Assinar/i });
    expect(concluir).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("imagem")).toBeInTheDocument());
  });

  it("documento de página única não pede rubrica", async () => {
    abrir();
    await waitFor(() => expect(screen.getByTestId("imagem")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Rubricar/i })).toBeNull();
  });

  it("libera o botão final após a assinatura e devolve o desenho", async () => {
    const onConcluir = abrir();
    await waitFor(() => expect(captura.emitir).toBeTruthy());
    fireEvent.click(screen.getByTestId("captura")); // garante foco; a emissão vem do mock
    captura.emitir!(PNG);
    const concluir = screen.getByRole("button", { name: /Concluir e Assinar/i });
    await waitFor(() => expect(concluir).toBeEnabled());
    fireEvent.click(concluir);
    expect(onConcluir).toHaveBeenCalledWith(PNG);
  });
});
