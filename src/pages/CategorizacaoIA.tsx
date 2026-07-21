import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Trash2, Search, Brain, BookOpen, User, Bot } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/date-utils";

type Rule = {
  id: string;
  pattern: string;
  match_type: string;
  scope: string;
  source: string;
  confidence: number;
  hit_count: number;
  is_active: boolean;
  last_hit_at: string | null;
  transaction_type: string | null;
  context: string | null;
  company_id: string | null;
  category_id: string;
  created_at: string;
};

type Category = { id: string; name: string; color: string | null };

const scopeLabel: Record<string, string> = {
  system: "Sistema",
  company: "Empresa",
  user: "Usuário",
};

const sourceLabel: Record<string, string> = {
  seed: "Semente",
  ai: "IA",
  user_manual: "Manual",
  user_correction: "Correção",
  suggestion_accepted: "Sugestão",
};

const sourceIcon: Record<string, JSX.Element> = {
  seed: <BookOpen className="h-3 w-3" />,
  ai: <Bot className="h-3 w-3" />,
  user_manual: <User className="h-3 w-3" />,
  user_correction: <User className="h-3 w-3" />,
  suggestion_accepted: <Sparkles className="h-3 w-3" />,
};

export default function CategorizacaoIA() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [runningBatch, setRunningBatch] = useState(false);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["categorization-rules", contextType, selectedCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorization_rules")
        .select("*")
        .order("hit_count", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as Rule[]) ?? [];
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories-simple"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, color");
      if (error) throw error;
      return (data as Category[]) ?? [];
    },
  });

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (scopeFilter !== "all" && r.scope !== scopeFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (search && !r.pattern.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rules, scopeFilter, sourceFilter, search]);

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("categorization_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorization-rules"] });
      toast.success("Regra atualizada");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, category_id }: { id: string; category_id: string }) => {
      const { error } = await supabase
        .from("categorization_rules")
        .update({ category_id, source: "user_correction", confidence: 0.9 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorization-rules"] });
      toast.success("Categoria da regra atualizada");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categorization_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorization-rules"] });
      toast.success("Regra excluída");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  const runBatch = async () => {
    setRunningBatch(true);
    try {
      const { data, error } = await supabase.rpc("categorize_transactions_batch", {
        p_context: contextType ? contextType.toUpperCase() : null,
        p_company_id: selectedCompanyId ?? null,
        p_limit: 500,
      });
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      toast.success(
        `Rodada: ${row?.matched ?? 0} categorizadas · ${row?.unmatched ?? 0} sem match`,
      );
      qc.invalidateQueries({ queryKey: ["categorization-rules"] });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao rodar categorização");
    } finally {
      setRunningBatch(false);
    }
  };

  const stats = useMemo(() => {
    const total = rules.length;
    const bySource = rules.reduce<Record<string, number>>((acc, r) => {
      acc[r.source] = (acc[r.source] ?? 0) + 1;
      return acc;
    }, {});
    const totalHits = rules.reduce((s, r) => s + (r.hit_count ?? 0), 0);
    return { total, bySource, totalHits };
  }, [rules]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Categorização Automática
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Regras aprendidas pelo sistema, IA e por você. Quanto mais lançamentos, mais preciso.
          </p>
        </div>
        <Button onClick={runBatch} disabled={runningBatch}>
          <Sparkles className="h-4 w-4 mr-2" />
          {runningBatch ? "Processando..." : "Auto-categorizar pendentes"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Regras ativas" value={stats.total} />
        <StatCard label="Acertos totais" value={stats.totalHits} />
        <StatCard label="Aprendidas do usuário" value={(stats.bySource.user_manual ?? 0) + (stats.bySource.user_correction ?? 0)} />
        <StatCard label="Criadas pela IA" value={stats.bySource.ai ?? 0} />
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Regras ({stats.total})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regras de categorização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por padrão..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={scopeFilter} onValueChange={setScopeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Escopo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos escopos</SelectItem>
                    <SelectItem value="system">Sistema</SelectItem>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas origens</SelectItem>
                    <SelectItem value="seed">Semente</SelectItem>
                    <SelectItem value="ai">IA</SelectItem>
                    <SelectItem value="user_manual">Manual</SelectItem>
                    <SelectItem value="user_correction">Correção</SelectItem>
                    <SelectItem value="suggestion_accepted">Sugestão aceita</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Padrão</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Escopo</TableHead>
                      <TableHead className="text-right">Acertos</TableHead>
                      <TableHead className="text-right">Confiança</TableHead>
                      <TableHead>Último acerto</TableHead>
                      <TableHead className="text-center">Ativa</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma regra encontrada</TableCell></TableRow>
                    ) : filtered.map((r) => {
                      const cat = catMap.get(r.category_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs max-w-[240px] truncate" title={r.pattern}>
                            {r.pattern}
                            {r.match_type !== "contains" && (
                              <Badge variant="outline" className="ml-1 text-[10px]">{r.match_type}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={r.category_id}
                              onValueChange={(v) => updateCategory.mutate({ id: r.id, category_id: v })}
                            >
                              <SelectTrigger className="h-8 w-[200px]">
                                <SelectValue>
                                  <span className="flex items-center gap-2">
                                    {cat?.color && <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />}
                                    {cat?.name ?? "—"}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="gap-1">
                              {sourceIcon[r.source] ?? null}
                              {sourceLabel[r.source] ?? r.source}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{scopeLabel[r.scope] ?? r.scope}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.hit_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{(r.confidence * 100).toFixed(0)}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.last_hit_at ? formatDate(r.last_hit_at) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={r.is_active}
                              onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })}
                            />
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    O padrão "{r.pattern}" não será mais usado para categorizar automaticamente. Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteRule.mutate(r.id)}>
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
