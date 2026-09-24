import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Row = {
  id: string;
  pluggy_item_id: string;
  connector_name: string | null;
  company_name: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  horas_parada: number;
};

/** Conexões ativas sem sincronizar há mais de 2 dias (a coleta agendada é diária). */
export function PluggyStaleConnections() {
  const q = useQuery({
    queryKey: ["pluggy-stale-connections"],
    refetchInterval: 300_000,
    queryFn: async (): Promise<Row[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("pluggy_stale_connections", { _horas: 48 });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const itens = q.data ?? [];

  return (
    <Card className={itens.length ? "border-destructive/50" : undefined}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-destructive" />
            <p className="text-sm font-semibold">Conexões paradas há mais de 2 dias</p>
          </div>
          {q.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant={itens.length ? "destructive" : "secondary"}>{itens.length}</Badge>
          )}
        </div>
        {q.isError ? (
          <p className="text-xs text-destructive">Não foi possível carregar as conexões paradas.</p>
        ) : itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todas as conexões ativas sincronizaram nos últimos 2 dias.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Empresa</th>
                  <th className="py-1.5 pr-3">Instituição</th>
                  <th className="py-1.5 pr-3">Última sincronização</th>
                  <th className="py-1.5 pr-3">Parada há</th>
                  <th className="py-1.5">Último resultado</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5 pr-3">{r.company_name ?? "—"}</td>
                    <td className="py-1.5 pr-3">{r.connector_name ?? r.pluggy_item_id.slice(0, 8)}</td>
                    <td className="py-1.5 pr-3">
                      {r.last_synced_at ? format(new Date(r.last_synced_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Nunca"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="destructive" className="font-normal">
                        {Math.floor(Number(r.horas_parada) / 24)} dias
                      </Badge>
                    </td>
                    <td className="py-1.5 max-w-[320px] truncate" title={r.last_sync_error ?? ""}>
                      {r.last_sync_status ?? "—"}
                      {r.last_sync_error ? ` · ${r.last_sync_error}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
