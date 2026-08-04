import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, AlertTriangle, Check, Undo2, History, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { parseEdgeFunctionError } from "@/lib/edgeFunctionError";

export type ChartAccountSuggestion = {
  category_code: string;
  chart_account_code: string | null;
  template_key: string | null;
  confidence: number;
  rationale: string;
  requires_review: boolean;
};

type LogRow = {
  id: string;
  batch_id: string;
  category_code: string;
  category_name: string | null;
  previous_chart_account_code: string | null;
  new_chart_account_code: string | null;
  chart_account_name: string | null;
  confidence: number | null;
  rationale: string | null;
  requires_review: boolean;
  applied_at: string;
  reverted_at: string | null;
};

type Batch = {
  batch_id: string;
  applied_at: string;
  rows: LogRow[];
  reverted: boolean;
};

type ApplyResult = {
  batch_id: string;
  applied: number;
  failures: { category_code: string; message: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Categorias sem conta contábil vinculada (código → nome). */
  pendingLabels: Record<string, string>;
  chartNames: Record<string, string>;
  onApplied: () => void;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function SuggestChartAccountsDialog({
  open, onOpenChange, pendingLabels, chartNames, onApplied,
}: Props) {
  const [tab, setTab] = useState("sugestoes");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [autoApply, setAutoApply] = useState(true);
  const [suggestions, setSuggestions] = useState<ChartAccountSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const applicable = useMemo(
    () => suggestions.filter((s) => s.chart_account_code),
    [suggestions],
  );

  const loadHistory = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("category_template_chart_links_log")
      .select("*")
      .order("applied_at", { ascending: false })
      .limit(300);
    if (error) return;
    const rows = (data ?? []) as LogRow[];
    const map = new Map<string, Batch>();
    for (const r of rows) {
      const b = map.get(r.batch_id);
      if (b) {
        b.rows.push(r);
        if (!r.reverted_at) b.reverted = false;
      } else {
        map.set(r.batch_id, {
          batch_id: r.batch_id,
          applied_at: r.applied_at,
          rows: [r],
          reverted: !!r.reverted_at,
        });
      }
    }
    setBatches(Array.from(map.values()));
  }, []);

  useEffect(() => {
    if (open) void loadHistory();
  }, [open, loadHistory]);

  const applyItems = useCallback(
    async (items: ChartAccountSuggestion[]) => {
      if (items.length === 0) return null;
      setApplying(true);
      try {
        const { data, error } = await (supabase as any).rpc("apply_chart_account_suggestions", {
          _items: items.map((s) => ({
            category_code: s.category_code,
            chart_account_code: s.chart_account_code,
            confidence: s.confidence,
            rationale: s.rationale,
            requires_review: s.requires_review,
          })),
        });
        if (error) {
          toast.error("Não foi possível aplicar as sugestões", { description: error.message });
          return null;
        }
        const result = data as ApplyResult;
        if (result.applied > 0) {
          setLastBatchId(result.batch_id);
          toast.success(`${result.applied} vínculo(s) aplicado(s)`, {
            description: "Você pode desfazer este lote no histórico.",
          });
          const doneCodes = new Set(items.map((i) => i.category_code));
          setSuggestions((prev) => prev.filter((s) => !doneCodes.has(s.category_code)));
          setSelected(new Set());
          onApplied();
          await loadHistory();
        }
        if (result.failures?.length) {
          toast.error(`${result.failures.length} sugestão(ões) recusada(s) pela validação`, {
            description: result.failures[0]?.message,
          });
        }
        return result;
      } finally {
        setApplying(false);
      }
    },
    [loadHistory, onApplied],
  );

  const run = async () => {
    setLoading(true);
    setSuggestions([]);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("suggest-chart-account", {
        body: { limit: 40 },
      });
      if (error) {
        const info = await parseEdgeFunctionError(error, "Falha ao gerar sugestões");
        toast.error("Não foi possível sugerir contas", { description: info.message });
        return;
      }
      const rows = ((data as { suggestions?: ChartAccountSuggestion[] })?.suggestions ?? []);
      setSuggestions(rows);
      const confident = rows.filter((s) => s.chart_account_code && !s.requires_review);
      setSelected(new Set(confident.map((s) => s.category_code)));
      if (rows.length === 0) {
        toast.success("Todas as categorias padrão já possuem conta contábil vinculada.");
        return;
      }
      if (autoApply && confident.length > 0) {
        await applyItems(confident);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const apply = async () => {
    const toApply = applicable.filter((s) => selected.has(s.category_code));
    if (toApply.length === 0) {
      toast.error("Selecione ao menos uma sugestão.");
      return;
    }
    await applyItems(toApply);
  };

  const revert = async (batchId: string) => {
    setReverting(batchId);
    try {
      const { data, error } = await (supabase as any).rpc("revert_chart_account_suggestion_batch", {
        _batch_id: batchId,
      });
      if (error) {
        toast.error("Não foi possível desfazer o lote", { description: error.message });
        return;
      }
      const result = data as { reverted: number; failures: { message: string }[] };
      if (result.reverted > 0) {
        toast.success(`${result.reverted} vínculo(s) restaurado(s) ao valor anterior`);
        onApplied();
        await loadHistory();
      }
      if (result.failures?.length) {
        toast.error("Alguns vínculos não puderam ser restaurados", {
          description: result.failures[0]?.message,
        });
      }
    } finally {
      setReverting(null);
    }
  };

  const pendingCount = Object.keys(pendingLabels).length;
  const lastBatch = batches.find((b) => b.batch_id === lastBatchId && !b.reverted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Sugerir contas contábeis com IA
          </DialogTitle>
          <DialogDescription>
            O assistente lê o nome, o subtipo, as orientações e as palavras-chave de cada categoria e
            compara com o "como usar" e as palavras-chave das contas do plano V2. Tudo o que for
            aplicado fica registrado e pode ser desfeito.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="sugestoes">Sugestões</TabsTrigger>
            <TabsTrigger value="historico" className="gap-1">
              <History className="h-3.5 w-3.5" /> Histórico
              {batches.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px]">{batches.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sugestoes" className="space-y-3 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoApply}
                onCheckedChange={(v) => setAutoApply(v === true)}
                aria-label="Aplicar automaticamente as sugestões confiáveis"
              />
              Aplicar automaticamente as sugestões confiáveis após a análise
            </label>

            {lastBatch && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <span className="text-sm">
                  Último lote: {lastBatch.rows.length} vínculo(s) em {fmtDate(lastBatch.applied_at)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revert(lastBatch.batch_id)}
                  disabled={reverting === lastBatch.batch_id}
                >
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                  {reverting === lastBatch.batch_id ? "Desfazendo..." : "Desfazer último lote"}
                </Button>
              </div>
            )}

            {suggestions.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {pendingCount} categoria(s) padrão sem conta contábil vinculada. O assistente analisa até 40 por rodada.
                </p>
                {loading || applying ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <Button onClick={run} disabled={pendingCount === 0}>
                    <Sparkles className="h-4 w-4 mr-2" /> Analisar categorias sem conta
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{suggestions.length} sugestão(ões) · {selected.size} selecionada(s)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selected.size === applicable.length
                          ? new Set()
                          : new Set(applicable.map((s) => s.category_code)),
                      )
                    }
                  >
                    {selected.size === applicable.length ? "Limpar seleção" : "Selecionar todas"}
                  </Button>
                </div>

                <div className="divide-y rounded-md border">
                  {suggestions.map((s) => {
                    const disabled = !s.chart_account_code;
                    return (
                      <div key={s.category_code} className="flex gap-3 p-3">
                        <Checkbox
                          className="mt-1"
                          checked={selected.has(s.category_code)}
                          disabled={disabled}
                          onCheckedChange={() => toggle(s.category_code)}
                          aria-label={`Aplicar sugestão para ${s.category_code}`}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">{s.category_code}</span>
                            <span className="text-sm font-medium truncate">
                              {pendingLabels[s.category_code] ?? s.category_code}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {s.chart_account_code ? (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {s.chart_account_code} — {chartNames[s.chart_account_code] ?? ""}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Sem conta compatível
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px]">
                              {Math.round(s.confidence * 100)}% de confiança
                            </Badge>
                            {s.requires_review ? (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" /> Revisar
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Check className="h-3 w-3" /> Confiável
                              </Badge>
                            )}
                          </div>
                          {s.rationale && (
                            <p className="text-xs text-muted-foreground">{s.rationale}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-3 pt-3">
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma aplicação registrada ainda.
              </p>
            ) : (
              batches.map((b) => (
                <div key={b.batch_id} className="rounded-md border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {b.rows.length} vínculo(s) · {fmtDate(b.applied_at)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        lote {b.batch_id.slice(0, 8)}
                      </p>
                    </div>
                    {b.reverted ? (
                      <Badge variant="outline" className="text-[10px]">Desfeito</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revert(b.batch_id)}
                        disabled={reverting === b.batch_id}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        {reverting === b.batch_id ? "Desfazendo..." : "Desfazer lote"}
                      </Button>
                    )}
                  </div>
                  <div className="divide-y">
                    {b.rows.map((r) => (
                      <div key={r.id} className="space-y-1 p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">{r.category_code}</span>
                          <span className="font-medium">{r.category_name ?? r.category_code}</span>
                          {r.reverted_at && (
                            <Badge variant="outline" className="text-[10px]">
                              revertido em {fmtDate(r.reverted_at)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                          <span className="font-mono">
                            {r.previous_chart_account_code ?? "sem conta"}
                          </span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-mono text-foreground">
                            {r.new_chart_account_code ?? "sem conta"}
                            {r.chart_account_name ? ` — ${r.chart_account_name}` : ""}
                          </span>
                          {r.confidence != null && (
                            <Badge variant="secondary" className="text-[10px]">
                              {Math.round(Number(r.confidence) * 100)}%
                            </Badge>
                          )}
                          {r.requires_review && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" /> revisado manualmente
                            </Badge>
                          )}
                        </div>
                        {r.rationale && <p className="text-muted-foreground">{r.rationale}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {tab === "sugestoes" && suggestions.length > 0 && (
            <>
              <Button variant="outline" onClick={run} disabled={loading || applying}>
                {loading ? "Analisando..." : "Analisar novamente"}
              </Button>
              <Button onClick={apply} disabled={applying || selected.size === 0}>
                {applying ? "Aplicando..." : `Aplicar ${selected.size} vínculo(s)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
