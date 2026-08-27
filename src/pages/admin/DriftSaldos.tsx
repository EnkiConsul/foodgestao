import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PlayCircle, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type DriftRow = {
  id: string;
  scan_id: string;
  scanned_at: string;
  account_id: string;
  account_name: string;
  context: "pf" | "pj";
  company_id: string | null;
  stored_balance: number;
  computed_balance: number;
  drift: number;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export default function AdminDriftSaldos() {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [search, setSearch] = useState("");
  const [resolving, setResolving] = useState<DriftRow | null>(null);
  const [note, setNote] = useState("");

  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["balance-drift", showResolved],
    queryFn: async () => {
      let q = supabase
        .from("balance_drift_snapshots")
        .select("*")
        .order("scanned_at", { ascending: false })
        .limit(500);
      if (!showResolved) q = q.is("resolved_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DriftRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return data;
    return data.filter((r) => r.account_name.toLowerCase().includes(s));
  }, [data, search]);

  const scanNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("run_balance_drift_scan");
      if (error) throw error;
      return (data as Array<{ drift_count: number }>)?.[0];
    },
    onSuccess: (res) => {
      toast.success(
        res?.drift_count
          ? `Varredura concluída — ${res.drift_count} divergência(s) detectada(s).`
          : "Varredura concluída — nenhuma divergência.",
      );
      qc.invalidateQueries({ queryKey: ["balance-drift"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha ao executar varredura.";
      toast.error(msg);
    },
  });

  const resolveMut = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string | null }) => {
      const { error } = await supabase.rpc("resolve_balance_drift", {
        _snapshot_id: id,
        _note: note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Divergência marcada como resolvida.");
      setResolving(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["balance-drift"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha ao resolver.";
      toast.error(msg);
    },
  });

  const unresolvedCount = data.filter((r) => !r.resolved_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <AdminPageHeader
          title="Auditoria de Saldos"
          description="Divergências entre o saldo armazenado e o saldo calculado pelas transações."
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => scanNow.mutate()}
            disabled={scanNow.isPending}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {scanNow.isPending ? "Executando..." : "Rodar varredura agora"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Divergências abertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold">{unresolvedCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Última varredura</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {data[0]?.scanned_at
                ? format(new Date(data[0].scanned_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Agendamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">Diário — 01:15 (BRT)</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Buscar por conta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show-resolved"
                checked={showResolved}
                onCheckedChange={setShowResolved}
              />
              <Label htmlFor="show-resolved" className="text-sm">
                Mostrar resolvidos
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detectado</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Contexto</TableHead>
                  <TableHead className="text-right">Armazenado</TableHead>
                  <TableHead className="text-right">Calculado</TableHead>
                  <TableHead className="text-right">Divergência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {showResolved
                        ? "Nenhuma divergência registrada."
                        : "Nenhuma divergência em aberto. 🎉"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(row.scanned_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{row.account_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {row.context}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtMoney(row.stored_balance)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtMoney(row.computed_balance)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold text-sm ${
                          Number(row.drift) < 0 ? "text-destructive" : "text-orange-600"
                        }`}
                      >
                        {fmtMoney(row.drift)}
                      </TableCell>
                      <TableCell>
                        {row.resolved_at ? (
                          <Badge variant="secondary">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Resolvido
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Aberto</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!row.resolved_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResolving(row);
                              setNote("");
                            }}
                          >
                            Resolver
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar divergência como resolvida</DialogTitle>
          </DialogHeader>
          {resolving && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Conta: </span>
                <span className="font-medium">{resolving.account_name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Armazenado</div>
                  <div className="font-mono">{fmtMoney(resolving.stored_balance)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Calculado</div>
                  <div className="font-mono">{fmtMoney(resolving.computed_balance)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Divergência</div>
                  <div className="font-mono font-semibold">{fmtMoney(resolving.drift)}</div>
                </div>
              </div>
              <div>
                <Label htmlFor="resolve-note">Nota (opcional)</Label>
                <Input
                  id="resolve-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex.: ajuste manual aplicado, causa identificada..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolving(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                resolving &&
                resolveMut.mutate({ id: resolving.id, note: note.trim() || null })
              }
              disabled={resolveMut.isPending}
            >
              {resolveMut.isPending ? "Salvando..." : "Marcar como resolvido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
