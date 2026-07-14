import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusLabel: Record<string, string> = {
  pendente_colega: "Aguardando colega",
  pendente_gestor: "Aguardando gestor",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

export default function DpMeuTrocas() {
  const { user } = useAuth();
  const list = useQuery({
    queryKey: ["dp_meu_trocas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cid } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!cid) return [];
      const { data } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome)")
        .or(`solicitante_id.eq.${cid},destino_id.eq.${cid}`)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
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
          {list.data?.map((t: any) => (
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
              <CardContent><p className="text-sm">{t.motivo}</p></CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
