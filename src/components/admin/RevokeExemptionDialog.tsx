import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRemoveExemption } from "@/hooks/useBilling";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  subscriptionId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function useCarenciaDias() {
  return useQuery({
    queryKey: ["system-param", "carencia_pos_cortesia_dias"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("system_parameters").select("value").eq("key", "carencia_pos_cortesia_dias").maybeSingle();
      const n = Number(data?.value);
      return Number.isInteger(n) && n > 0 ? n : 10;
    },
  });
}

export function RevokeExemptionDialog({ subscriptionId, onOpenChange }: Props) {
  const remove = useRemoveExemption();
  const { data: dias = 10 } = useCarenciaDias();
  const [reason, setReason] = useState("");
  const open = !!subscriptionId;

  useEffect(() => { if (open) setReason(""); }, [open]);

  const valido = reason.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revogar Cortesia</DialogTitle>
          <DialogDescription>
            O cliente não é ativado de graça: entra em carência de {dias} dias e recebe um e-mail com o
            prazo e o link para escolher um plano. Depois do prazo, o acesso é bloqueado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label>Motivo da revogação</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Ex.: fim da parceria comercial acordada em reunião"
          />
          {!valido && (
            <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!valido || remove.isPending}
            onClick={() =>
              remove.mutate(
                { subscriptionId: subscriptionId!, reason: reason.trim() },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {remove.isPending ? "Revogando..." : "Revogar e iniciar carência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
