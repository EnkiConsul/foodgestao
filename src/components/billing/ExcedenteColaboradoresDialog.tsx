import { useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { registrarConfirmacaoExcedente, type PedidoExcedente } from "@/lib/billing/excedente-colaboradores";
import { formatCents } from "@/lib/billing";

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

  const ent = pedido?.enterprise?.compensa ? pedido.enterprise : null;

  return (
    <AlertDialog open={!!pedido} onOpenChange={(o) => !o && fechar(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Colaborador Acima da Franquia</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Você passará de <strong>{pedido?.de}</strong> para <strong>{pedido?.para}</strong> colaboradores;
                o excedente custa <strong>{formatCents(pedido?.valorUnitCents ?? 0)}/mês</strong> por colaborador.
              </p>
              <p>
                Sua franquia atual é de {pedido?.limite} colaboradores. O excedente é apurado no fechamento do
                mês e somado à próxima fatura. Sua confirmação fica registrada no histórico.
              </p>
              {ent && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-foreground">
                  <p className="font-medium">O {ent.nome} sai mais em conta</p>
                  <p className="text-muted-foreground">
                    Com {pedido?.para} colaboradores: {formatCents(ent.valorEnterpriseCents)}/mês no Enterprise,
                    contra {formatCents(ent.valorAtualCents)}/mês no plano atual com excedentes. Sem limite de colaboradores.
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={() => fechar(false)}>Cancelar</AlertDialogCancel>
          {ent && (
            <Button variant="outline" asChild>
              <a href={`/planos?plano=${ent.plano}`} onClick={() => fechar(false)}>Mudar para o Enterprise</a>
            </Button>
          )}
          <AlertDialogAction onClick={() => fechar(true)}>Confirmar e Incluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
