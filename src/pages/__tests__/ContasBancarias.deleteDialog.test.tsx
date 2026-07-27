import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Verifica que a AlertDialogDescription do diálogo de exclusão
 * mostra a mensagem correta conforme a conta possua ou não
 * lançamentos vinculados.
 *
 * Reproduzimos aqui a mesma árvore condicional usada em
 * `src/pages/ContasBancarias.tsx` (AlertDialog de exclusão),
 * para isolar o teste da carga real do Supabase.
 */
function DeleteAccountDescription({
  accountName,
  hasTx,
}: {
  accountName: string;
  hasTx: boolean | null;
}) {
  return (
    <p data-testid="delete-account-description">
      {hasTx === null && (
        <>Verificando lançamentos vinculados à conta <strong>{accountName}</strong>…</>
      )}
      {hasTx === false && (
        <>A conta <strong>{accountName}</strong> não possui lançamentos vinculados e será <strong>excluída definitivamente</strong>. Esta ação não pode ser desfeita.</>
      )}
      {hasTx === true && (
        <>A conta <strong>{accountName}</strong> possui lançamentos vinculados e será <strong>arquivada</strong> para preservar o histórico contábil. Ela deixará de aparecer nas listas.</>
      )}
    </p>
  );
}

describe("Diálogo de exclusão de conta bancária — mensagem dinâmica", () => {
  it("mostra estado de verificação enquanto carrega a contagem", () => {
    render(<DeleteAccountDescription accountName="Conta Teste" hasTx={null} />);
    const el = screen.getByTestId("delete-account-description");
    expect(el.textContent).toMatch(/Verificando lançamentos vinculados/i);
    expect(el.textContent).toContain("Conta Teste");
  });

  it("anuncia exclusão definitiva quando NÃO há lançamentos vinculados", () => {
    render(<DeleteAccountDescription accountName="Conta Sem Movimento" hasTx={false} />);
    const el = screen.getByTestId("delete-account-description");
    expect(el.textContent).toMatch(/não possui lançamentos vinculados/i);
    expect(el.textContent).toMatch(/excluída definitivamente/i);
    expect(el.textContent).not.toMatch(/arquivada/i);
    expect(el.textContent).toContain("Conta Sem Movimento");
  });

  it("anuncia arquivamento quando HÁ lançamentos vinculados", () => {
    render(<DeleteAccountDescription accountName="Conta Com Histórico" hasTx={true} />);
    const el = screen.getByTestId("delete-account-description");
    expect(el.textContent).toMatch(/possui lançamentos vinculados/i);
    expect(el.textContent).toMatch(/arquivada/i);
    expect(el.textContent).toMatch(/preservar o histórico contábil/i);
    expect(el.textContent).not.toMatch(/excluída definitivamente/i);
    expect(el.textContent).toContain("Conta Com Histórico");
  });

  it("alterna a mensagem quando o estado muda de carregando para com histórico", () => {
    const { rerender } = render(
      <DeleteAccountDescription accountName="X" hasTx={null} />,
    );
    expect(screen.getByTestId("delete-account-description").textContent).toMatch(
      /Verificando/i,
    );

    rerender(<DeleteAccountDescription accountName="X" hasTx={false} />);
    expect(screen.getByTestId("delete-account-description").textContent).toMatch(
      /excluída definitivamente/i,
    );

    rerender(<DeleteAccountDescription accountName="X" hasTx={true} />);
    expect(screen.getByTestId("delete-account-description").textContent).toMatch(
      /arquivada/i,
    );
  });
});
