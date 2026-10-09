import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/** Liga/desliga a emissão de NFS-e pelo Asaas (só super admin; padrão desligado). */
export function NfseParametroCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["param-emitir-nfse"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_parameters").select("value,updated_at").eq("key", "emitir_nfse").maybeSingle();
      if (error) throw error;
      return data as { value: string; updated_at: string } | null;
    },
  });
  const m = useMutation({
    mutationFn: async (v: "ligado" | "desligado") => {
      const { error } = await (supabase as any).rpc("billing_v2_set_emitir_nfse", { _valor: v });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Parâmetro de nota fiscal atualizado."); qc.invalidateQueries({ queryKey: ["param-emitir-nfse"] }); },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar."),
  });
  const ligado = q.data?.value === "ligado";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">Nota Fiscal pelo Asaas <Badge variant={ligado ? "default" : "secondary"}>{ligado ? "Ligada" : "Desligada"}</Badge></CardTitle>
        <CardDescription>
          Emite NFS-e para o pagador da conta de cobrança ao confirmar o pagamento. Nunca emite para valor zero.
          Valide com o contador a configuração municipal no Asaas antes de ligar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Última alteração: {q.data?.updated_at ? new Date(q.data.updated_at).toLocaleString("pt-BR") : "—"}</span>
        <Switch checked={ligado} disabled={q.isLoading || m.isPending} aria-label="Emitir nota fiscal"
          onCheckedChange={(c) => m.mutate(c ? "ligado" : "desligado")} />
      </CardContent>
    </Card>
  );
}
