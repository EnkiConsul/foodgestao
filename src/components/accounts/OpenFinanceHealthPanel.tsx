import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface OpenFinanceHealth {
  connections_active: number;
  connections_needing_action: number;
  runs_queued: number;
  runs_running: number;
  runs_error_24h: number;
  runs_success_24h: number;
  last_synced_at: string | null;
  pending_reconciliation: number;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 60 * 24) return `há ${Math.floor(diffMin / 60)} h`;
  return d.toLocaleDateString("pt-BR");
}

interface Props {
  companyId: string;
  refreshKey?: number;
}

export default function OpenFinanceHealthPanel({ companyId, refreshKey }: Props) {
  const [health, setHealth] = useState<OpenFinanceHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("open_finance_sync_health", {
      _company_id: companyId,
    });
    if (!error && data) setHealth(data as unknown as OpenFinanceHealth);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading && !health) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando saúde da sincronização...
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const items = [
    { label: "Ativas", value: health.connections_active, icon: Activity },
    { label: "Na fila", value: health.runs_queued + health.runs_running, icon: Clock },
    { label: "Erros 24h", value: health.runs_error_24h, icon: AlertTriangle },
    { label: "A conciliar", value: health.pending_reconciliation, icon: RefreshCw },
  ];

  return (
    <Card>
      <CardContent className="py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-base font-semibold leading-none">{value}</div>
                <div className="text-xs text-muted-foreground truncate">{label}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Última sincronização: {formatWhen(health.last_synced_at)}</span>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
