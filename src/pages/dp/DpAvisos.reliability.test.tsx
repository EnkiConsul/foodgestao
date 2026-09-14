import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvisoDialog } from "@/pages/dp/DpAvisos";

vi.mock("@/hooks/useDpCadastros", () => ({
  useDpUnidades: () => ({ data: [] }),
}));
vi.mock("@/hooks/useDpColaboradores", () => ({
  useDpColaboradores: () => ({ data: [] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn() }) } },
}));

const aviso = {
  id: "a1",
  titulo: "AVISO DE TESTE",
  conteudo: "Conteúdo do aviso",
  publicado_em: "2026-09-01T00:00:00.000Z",
  expira_em: "2026-09-30T00:00:00.000Z",
  escopo: "empresa",
} as any;

function renderDialog(onSave: (v: any) => Promise<void>, onOpenChange = vi.fn()) {
  render(
    <AvisoDialog aviso={aviso} open onOpenChange={onOpenChange} onSave={onSave} companyId="empresa-1" />,
  );
  return { onOpenChange };
}

afterEach(() => cleanup());

describe("formulário de aviso: sucesso só depois do backend", () => {
  it("mantém a janela aberta e os dados quando a gravação falha", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("falha no banco"));
    const { onOpenChange } = renderDialog(onSave);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("AVISO DE TESTE")).toBeTruthy();
  });

  it("fecha a janela somente após a confirmação do backend", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { onOpenChange } = renderDialog(onSave);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("duplo clique em resposta lenta não grava duas vezes", async () => {
    const user = userEvent.setup();
    let liberar: (() => void) | null = null;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => { liberar = () => resolve(); }),
    );
    renderDialog(onSave);

    const botao = screen.getByRole("button", { name: "Salvar" });
    await user.click(botao);
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Salvando…" })).catch(() => undefined);

    expect(onSave).toHaveBeenCalledTimes(1);
    liberar?.();
  });
});
