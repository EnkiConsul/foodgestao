import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type PendingItem = {
  itemId: string;
  ocorrencias: number;
  ultimaEm: string;
  motivo: string | null;
  instituicao: string | null;
};

function fmt(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return format(new Date(v), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return v;
  }
}

/**
 * Conexões cujo item do Open Finance parou de alimentar o sistema por falta de
 * vínculo com uma empresa. Sem este aviso, os eventos eram descartados em
 * silêncio e a conta do cliente ficava semanas sem atualizar.
 */
export function PluggyPendingLinks() {
  const pendentes = useQuery({
    queryKey: ["pluggy-pending-manual-link"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<PendingItem[]> => {
      const { data, error } = await supabase.rpc("pluggy_pending_manual_links", {
        _dias: 30,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        itemId: r.pluggy_item_id,
        ocorrencias: r.ocorrencias,
        ultimaEm: r.ultima_em,
        motivo: r.motivo,
        instituicao: r.connector_name,
      }));
    },
  });


  const itens = pendentes.data ?? [];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold">Conexões aguardando vínculo manual</p>
          </div>
          {pendentes.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {itens.length} conexão(ões) nos últimos 30 dias
            </span>
          )}
        </div>

        {pendentes.isError ? (
          <p className="text-xs text-destructive">
            Não foi possível carregar as conexões pendentes.
          </p>
        ) : itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma conexão pendente de vínculo. Todas as atualizações bancárias estão
            sendo direcionadas a uma empresa.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Estas conexões receberam atualizações do banco, mas o sistema não
              conseguiu definir a empresa de destino. Enquanto isso, novas
              atualizações ficam suspensas. Resolva em “Solicitações de conexão”
              abaixo.
            </p>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">Item</th>
                    <th className="py-1.5 pr-3">Instituição</th>
                    <th className="py-1.5 pr-3">Tentativas</th>
                    <th className="py-1.5 pr-3">Última em</th>
                    <th className="py-1.5">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => (
                    <tr key={it.itemId} className="border-t">
                      <td className="py-1.5 pr-3 font-mono">{it.itemId.slice(0, 8)}…</td>
                      <td className="py-1.5 pr-3">{it.instituicao ?? "—"}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="destructive" className="font-normal">
                          {it.ocorrencias}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3">{fmt(it.ultimaEm)}</td>
                      <td className="py-1.5 max-w-[320px] truncate">{it.motivo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
