import { useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { registrarConfirmacaoExcedente, type PedidoExcedente } from "@/lib/billing/excedente-colaboradores";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ExcedenteColaboradoresDialog() {
  const [pedido, setPedido] = useState<PedidoExcedente | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registrarConfirmacaoExcedente((p, resolve) => {
      resolver.current = resolve;
      setPedido(p);
    });
    return () => registrarConfirmacaoExcedente(null);
  }, []);

  const fechar = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  };

  return (
    <AlertDialog open={!!pedido} onOpenChange={(o) => !o && fechar(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Colaborador Acima da Franquia</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Você passará de <strong>{pedido?.de}</strong> para <strong>{pedido?.para}</strong> colaboradores;
                o excedente custa <strong>{brl(pedido?.valorUnitCents ?? 0)}/mês</strong> por colaborador.
              </p>
              <p>
                Sua franquia atual é de {pedido?.limite} colaboradores. O excedente é apurado no fechamento do
                mês e somado à próxima fatura. Sua confirmação fica registrada no histórico.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => fechar(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => fechar(true)}>Confirmar e Incluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
