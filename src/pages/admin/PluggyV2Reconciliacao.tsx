import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, AlertTriangle, CheckCircle2, GitCompareArrows } from "lucide-react";

type Row = {
  pluggy_item_id: string;
  v1_connection_id: string | null;
  v2_connection_id: string | null;
  v1_status: string | null;
  v2_status: string | null;
  v1_company_id: string | null;
  v2_company_id: string | null;
  v1_accounts_count: number;
  v2_accounts_count: number;
  v1_transactions_count: number;
  v2_transactions_count: number;
  v1_last_synced_at: string | null;
  v2_last_synced_at: string | null;
  divergences: string[] | null;
};

const divergenceLabel: Record<string, string> = {
  missing_in_v1: "Ausente na V1",
  missing_in_v2: "Ausente na V2",
  company_mismatch: "Empresa divergente",
  accounts_count_diff: "Qtd. de contas divergente",
  transactions_count_diff: "Qtd. de transações divergente",
};

export default function PluggyV2Reconciliacao() {
  const [filter, setFilter] = useState("");
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pluggy-v2-reconciliation"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pluggy_v2_reconciliation" as never);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    return list.filter((r) => {
      if (onlyDiffs && (!r.divergences || r.divergences.length === 0)) return false;
      if (!filter.trim()) return true;
      const q = filter.trim().toLowerCase();
      return (
        r.pluggy_item_id?.toLowerCase().includes(q) ||
        (r.v1_status ?? "").toLowerCase().includes(q) ||
        (r.v2_status ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, filter, onlyDiffs]);

  const totals = useMemo(() => {
    const list = data ?? [];
    const withDiff = list.filter((r) => (r.divergences?.length ?? 0) > 0).length;
    const onlyV1 = list.filter((r) => !r.v2_connection_id).length;
    const onlyV2 = list.filter((r) => !r.v1_connection_id).length;
    return { total: list.length, withDiff, onlyV1, onlyV2 };
  }, [data]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reconciliação Pluggy V1 ↔ V2"
        description="Shadow mode: compara conexões, contas e transações materializadas entre as integrações V1 e V2 antes do cutover."
        icon={GitCompareArrows}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Itens comparados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Com divergência</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">{totals.withDiff}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Só na V1</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.onlyV1}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Só na V2</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.onlyV2}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Itens Pluggy</CardTitle>
            <p className="text-sm text-muted-foreground">
              Atualização automática a cada 60 s.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filtrar por item_id ou status…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full md:w-64"
            />
            <Button
              variant={onlyDiffs ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyDiffs((v) => !v)}
            >
              {onlyDiffs ? "Só divergências" : "Todos"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Nenhuma divergência encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>pluggy_item_id</TableHead>
                    <TableHead>V1</TableHead>
                    <TableHead>V2</TableHead>
                    <TableHead className="text-right">Contas V1/V2</TableHead>
                    <TableHead className="text-right">Tx V1/V2</TableHead>
                    <TableHead>Divergências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.pluggy_item_id}>
                      <TableCell className="font-mono text-xs">{r.pluggy_item_id}</TableCell>
                      <TableCell>
                        {r.v1_connection_id ? (
                          <Badge variant="outline">{r.v1_status ?? "—"}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.v2_connection_id ? (
                          <Badge variant="outline">{r.v2_status ?? "—"}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.v1_accounts_count}/{r.v2_accounts_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.v1_transactions_count}/{r.v2_transactions_count}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(r.divergences ?? []).map((d) => (
                            <Badge key={d} variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {divergenceLabel[d] ?? d}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
