import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, PlayCircle, Undo2 } from "lucide-react";

const ALL_MODULES = [
  { key: "unidades", label: "Unidades", implemented: true },
  { key: "cargos", label: "Cargos", implemented: true },
  { key: "colaboradores", label: "Colaboradores", implemented: true },
  { key: "sindicatos", label: "Sindicatos", implemented: false },
  { key: "folgas", label: "Folgas", implemented: false },
  { key: "solicitacoes", label: "Solicitações", implemented: false },
  { key: "atestados", label: "Atestados", implemented: false },
  { key: "trocas", label: "Trocas", implemented: false },
  { key: "disciplinares", label: "Disciplinares", implemented: false },
  { key: "avisos", label: "Avisos", implemented: false },
  { key: "mensagens", label: "Mensagens", implemented: false },
  { key: "notificacoes", label: "Notificações", implemented: false },
  { key: "documentos", label: "Documentos", implemented: false },
] as const;

type RunRow = {
  id: string;
  company_id: string;
  status: string;
  dry_run: boolean;
  modules: string[];
  started_at: string | null;
  finished_at: string | null;
  source_counts: Record<string, number>;
  dest_counts: Record<string, number>;
  errors: unknown;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  running: "secondary",
  success: "default",
  failed: "destructive",
  rolled_back: "outline",
};

export default function ImportacoesDp() {
  const { isSuperAdmin, loading } = useSuperAdmin();
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("b0d450a7-0a70-4322-bcdb-c3abfea196ba");
  const [dryRun, setDryRun] = useState(true);
  const [batchSize, setBatchSize] = useState(200);
  const [selected, setSelected] = useState<string[]>(["unidades", "cargos", "colaboradores"]);

  const companies = useQuery({
    queryKey: ["import-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isSuperAdmin,
  });

  const runs = useQuery({
    queryKey: ["dp-import-runs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_import_runs")
        .select("id, company_id, status, dry_run, modules, started_at, finished_at, source_counts, dest_counts, errors")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
    enabled: !!isSuperAdmin && !!companyId,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("import-pakere-dp", {
        body: {
          company_id: companyId,
          dry_run: dryRun,
          batch_size: batchSize,
          modules: selected,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: dryRun ? "Simulação concluída" : "Importação concluída",
        description: `Status: ${data?.status ?? "?"} — veja o relatório abaixo.`,
      });
      qc.invalidateQueries({ queryKey: ["dp-import-runs", companyId] });
    },
    onError: (e: Error) => {
      toast({ title: "Falha", description: e.message, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.functions.invoke("rollback-pakere-dp-import", {
        body: { import_run_id: runId, dry_run: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Rollback executado" });
      qc.invalidateQueries({ queryKey: ["dp-import-runs", companyId] });
    },
    onError: (e: Error) => toast({ title: "Falha", description: e.message, variant: "destructive" }),
  });

  if (loading) return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!isSuperAdmin) return <Navigate to="/hub" replace />;

  const toggleModule = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importações DP — Pakere</h1>
        <p className="text-muted-foreground text-sm">
          Somente super administradores. Sempre execute em <strong>dry-run</strong> antes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova importação</CardTitle>
          <CardDescription>Escolha empresa de destino e os módulos a importar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Empresa de destino</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {(companies.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tamanho do lote</Label>
              <Input
                type="number"
                min={50}
                max={500}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Módulos</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ALL_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(m.key)}
                    onCheckedChange={() => toggleModule(m.key)}
                    disabled={!m.implemented}
                  />
                  <span className={m.implemented ? "" : "text-muted-foreground line-through"}>
                    {m.label}
                  </span>
                  {!m.implemented && <Badge variant="outline" className="text-[10px]">em breve</Badge>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="dry" checked={dryRun} onCheckedChange={(v) => setDryRun(v === true)} />
            <Label htmlFor="dry" className="cursor-pointer">
              Dry-run (simular, sem gravar nada)
            </Label>
          </div>

          <div className="flex justify-end">
            {dryRun ? (
              <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending || selected.length === 0}>
                {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                Executar simulação
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={runMutation.isPending || selected.length === 0}>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Executar importação real
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar importação real?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isto vai criar registros reais na empresa selecionada. Você poderá reverter
                      pela lista de runs abaixo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runMutation.mutate()}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (runs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução para esta empresa ainda.</p>
          ) : (
            <div className="space-y-3">
              {runs.data!.map((r) => (
                <div key={r.id} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
                      {r.dry_run && <Badge variant="outline">dry-run</Badge>}
                      <span className="text-muted-foreground text-xs">
                        {r.started_at ? new Date(r.started_at).toLocaleString("pt-BR") : "—"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Módulos: {r.modules.join(", ")}
                    </div>
                    <div className="text-xs">
                      Origem: {Object.entries(r.source_counts ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ")}
                    </div>
                    <div className="text-xs">
                      Destino: {Object.entries(r.dest_counts ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ")}
                    </div>
                  </div>
                  {!r.dry_run && r.status !== "rolled_back" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Undo2 className="w-4 h-4 mr-2" />
                          Reverter
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reverter esta importação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Vai remover apenas registros criados por esta run. Registros editados
                            após a importação são preservados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => rollbackMutation.mutate(r.id)}>
                            Confirmar rollback
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
