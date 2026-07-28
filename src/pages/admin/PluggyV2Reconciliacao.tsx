import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, AlertTriangle, CheckCircle2, ArrowRightLeft, DownloadCloud, Archive } from "lucide-react";
import { toast } from "sonner";

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

      <CutoverPanel />


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

type CompanyRow = { id: string; name: string; pluggy_version: string };

function CutoverPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies-pluggy-version"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, pluggy_version")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const setVersion = useMutation({
    mutationFn: async (args: { id: string; version: "v1" | "v2" }) => {
      const { error } = await supabase.rpc("set_company_pluggy_version" as never, {
        _company_id: args.id,
        _version: args.version,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Versão atualizada");
      qc.invalidateQueries({ queryKey: ["companies-pluggy-version"] });
    },
    onError: (e: unknown) => {
      toast.error("Falha ao atualizar", { description: (e as Error).message });
    },
  });

  const backfill = useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.functions.invoke("pluggy-v2-backfill", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data as { items_found: number; processed: number; failed: number };
    },
    onSuccess: (data) => {
      toast.success("Backfill concluído", {
        description: `${data.processed}/${data.items_found} itens re-materializados${data.failed ? ` — ${data.failed} falharam` : ""}`,
      });
      qc.invalidateQueries({ queryKey: ["pluggy-v2-reconciliation"] });
    },
    onError: (e: unknown) => {
      toast.error("Falha no backfill", { description: (e as Error).message });
    },
  });

  const cleanupV1 = useMutation({
    mutationFn: async (args: { companyId: string; confirm: boolean }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-v1-cleanup", {
        body: { company_id: args.companyId, confirm: args.confirm },
      });
      if (error) throw error;
      return data as {
        dry_run: boolean;
        counts?: { connections: number; raw_transactions: number; accounts: number };
        archived?: { connections: number; raw_transactions_deleted: number };
      };
    },
    onSuccess: (data) => {
      if (data.dry_run && data.counts) {
        const c = data.counts;
        const proceed = confirm(
          `Cleanup V1 (dry-run):\n\n• Conexões: ${c.connections}\n• Contas: ${c.accounts}\n• Raw transactions: ${c.raw_transactions}\n\nConfirmar arquivamento? Conexões viram 'archived' e raw_transactions serão apagadas (reproduzíveis via Backfill V2).`,
        );
        if (proceed) {
          // dispara execução real reusando a mutation
          const companyId = (data as unknown as { company: { id: string } }).company.id;
          cleanupV1.mutate({ companyId, confirm: true });
        }
      } else if (data.archived) {
        toast.success("Cleanup V1 concluído", {
          description: `${data.archived.connections} conexões arquivadas · ${data.archived.raw_transactions_deleted} raw apagadas`,
        });
        qc.invalidateQueries({ queryKey: ["pluggy-v2-reconciliation"] });
      }
    },
    onError: (e: unknown) => {
      toast.error("Falha no cleanup", { description: (e as Error).message });
    },
  });

  const filtered = useMemo(() => {
    const list = companies ?? [];
    if (!q.trim()) return list;
    const term = q.trim().toLowerCase();
    return list.filter((c) => c.name?.toLowerCase().includes(term) || c.id.includes(term));
  }, [companies, q]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Cutover por empresa</CardTitle>
          <p className="text-sm text-muted-foreground">
            Alterna a versão da integração Pluggy usada por cada empresa (feature flag).
          </p>
        </div>
        <Input
          placeholder="Buscar empresa…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full md:w-64"
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Versão atual</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const target: "v1" | "v2" = c.pluggy_version === "v2" ? "v1" : "v2";
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{c.id}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.pluggy_version === "v2" ? "default" : "outline"}>
                          {c.pluggy_version}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={backfill.isPending}
                            onClick={() => {
                              if (confirm(`Re-materializar todos os itens Pluggy V1 desta empresa no stack V2?\n\n${c.name}`)) {
                                backfill.mutate(c.id);
                              }
                            }}
                            title="Backfill V1→V2: busca itens existentes na Pluggy e materializa no V2"
                          >
                            <DownloadCloud className="mr-2 h-4 w-4" />
                            Backfill V2
                          </Button>
                          {c.pluggy_version === "v2" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cleanupV1.isPending}
                              onClick={() => cleanupV1.mutate({ companyId: c.id, confirm: false })}
                              title="Cleanup V1: arquiva conexões e apaga raw_transactions V1"
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              Cleanup V1
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={setVersion.isPending}
                            onClick={() => setVersion.mutate({ id: c.id, version: target })}
                          >
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Mudar para {target}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

