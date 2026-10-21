import { Button } from "@/components/ui/button";

/**
 * Falha fechada: se a leitura do modo de contratação (checkout_v2) der erro,
 * a tela antiga NÃO abre — mostra aviso com nova tentativa.
 */
export function ModoCheckoutFalha({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-medium">Não foi possível carregar a contratação. Atualize a página.</p>
      <Button onClick={onRetry} data-testid="modo-checkout-tentar">Tentar Novamente</Button>
    </div>
  );
}
