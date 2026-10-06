import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";
import { useCarenciaDias } from "./RevokeExemptionDialog";

/** Parâmetro do sistema: dias de carência após a revogação de uma cortesia. */
export function CarenciaParametroCard() {
  const qc = useQueryClient();
  const { data: dias } = useCarenciaDias();
  const [valor, setValor] = useState("");

  useEffect(() => { if (dias) setValor(String(dias)); }, [dias]);

  const salvar = useMutation({
    mutationFn: async () => {
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error("Informe um número inteiro de 1 a 90 dias.");
      const { error } = await (supabase as any)
        .from("system_parameters").update({ value: n }).eq("key", "carencia_pos_cortesia_dias");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-param", "carencia_pos_cortesia_dias"] });
      toast.success("Carência atualizada. Vale para as próximas revogações.");
    },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "salvar a carência", fallback: "Erro ao salvar" }),
  });

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Carência Após Cortesia</p>
          <p className="text-xs text-muted-foreground">
            Dias que o cliente mantém acesso depois que a cortesia é revogada.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="number" min={1} max={90} className="w-20"
            value={valor} onChange={(e) => setValor(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">dias</span>
          <Button size="sm" disabled={salvar.isPending || String(dias) === valor} onClick={() => salvar.mutate()}>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
