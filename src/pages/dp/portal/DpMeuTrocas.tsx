import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Repeat, Check, X, Ban } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusLabel: Record<string, string> = {
  pendente_colega: "Aguardando colega",
  pendente_gestor: "Aguardando gestor",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

export default function DpMeuTrocas() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const meRef = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return data as string | null;
    },
  });

  const list = useQuery({
    queryKey: ["dp_meu_trocas", meRef.data],
    enabled: !!meRef.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome)")
        .or(`solicitante_id.eq.${meRef.data},destino_id.eq.${meRef.data}`)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const responderColega = useMutation({
    mutationFn: async ({ id, aceito }: { id: string; aceito: boolean }) => {
      const { error } = await supabase.from("dp_trocas").update({
        colega_resposta: aceito ? "aprovada" : "recusada",
        colega_respondido_em: new Date().toISOString(),
        status: aceito ? "pendente_gestor" : "recusada",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resposta registrada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_trocas").update({ status: "cancelada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Troca cancelada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Minhas trocas — Portal</title></Helmet>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Repeat className="h-6 w-6" /> Minhas trocas
      </h1>
      {(list.data?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sem trocas.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((t: any) => {
            const meId = meRef.data;
            const souDestino = t.destino_id === meId;
            const souSolicitante = t.solicitante_id === meId;
            const podeResponderColega = souDestino && t.status === "pendente_colega";
            const podeCancelar = souSolicitante && ["pendente_colega", "pendente_gestor"].includes(t.status);
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {t.solicitante?.nome} → {t.destino?.nome}
                    </CardTitle>
                    <Badge variant="outline">{statusLabel[t.status] ?? t.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.data_original), "dd/MM/yyyy")} ↔ {format(new Date(t.data_proposta), "dd/MM/yyyy")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">{t.motivo}</p>
                  {(podeResponderColega || podeCancelar) && (
                    <div className="flex gap-2 pt-1">
                      {podeResponderColega && (
                        <>
                          <Button size="sm" onClick={() => responderColega.mutate({ id: t.id, aceito: true })}
                            disabled={responderColega.isPending}>
                            <Check className="h-4 w-4 mr-1" /> Aceitar
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => responderColega.mutate({ id: t.id, aceito: false })}
                            disabled={responderColega.isPending}>
                            <X className="h-4 w-4 mr-1" /> Recusar
                          </Button>
                        </>
                      )}
                      {podeCancelar && (
                        <Button size="sm" variant="ghost"
                          onClick={() => cancelar.mutate(t.id)} disabled={cancelar.isPending}>
                          <Ban className="h-4 w-4 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
