import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlans } from "@/hooks/usePlans";
import { useExemptSubscription } from "@/hooks/useBilling";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string | null;
  /** Used when opening from the Users screen — we will resolve the active subscription for this user. */
  userId?: string | null;
  defaultPlanId?: string | null;
}

export function ExemptSubscriptionDialog({ open, onOpenChange, subscriptionId, userId, defaultPlanId }: Props) {
  const { data: plans = [] } = usePlans();
  const exempt = useExemptSubscription();
  const [planId, setPlanId] = useState<string>("");
  const [mode, setMode] = useState<"permanent" | "until">("permanent");
  const [until, setUntil] = useState<string>("");
  const [reason, setReason] = useState("");

  // Resolve subscription if only userId was provided
  const { data: resolved } = useQuery({
    queryKey: ["resolve-sub-for-exempt", userId, open],
    enabled: open && !subscriptionId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, plan_id")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const effectiveSubId = subscriptionId ?? resolved?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setPlanId(defaultPlanId ?? resolved?.plan_id ?? "");
    setMode("permanent");
    setUntil("");
    setReason("");
  }, [open, defaultPlanId, resolved?.plan_id]);

  const handleSubmit = () => {
    if (!effectiveSubId) {
      toast.error("Cliente sem assinatura. Não é possível isentar.");
      return;
    }
    if (!planId) {
      toast.error("Selecione um plano");
      return;
    }
    if (mode === "until") {
      if (!until) return toast.error("Informe a data fim");
      const d = new Date(until);
      if (isNaN(d.getTime()) || d <= new Date()) return toast.error("Data fim deve ser futura");
    }
    exempt.mutate(
      {
        subscriptionId: effectiveSubId,
        planId,
        mode,
        exemptUntil: mode === "until" ? new Date(until).toISOString() : null,
        reason: reason.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Isentar mensalidade</DialogTitle>
          <DialogDescription>
            Libera acesso ao plano escolhido sem cobrança. Se houver assinatura ativa no Asaas, ela será cancelada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Plano liberado</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
              <SelectContent>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de isenção</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="permanent" /> Permanente
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="until" /> Até uma data
              </label>
            </RadioGroup>
          </div>

          {mode === "until" && (
            <div className="space-y-1.5">
              <Label>Isento até</Label>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Ex.: parceria, cortesia, compensação..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={exempt.isPending}>
            {exempt.isPending ? "Isentando..." : "Confirmar isenção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
