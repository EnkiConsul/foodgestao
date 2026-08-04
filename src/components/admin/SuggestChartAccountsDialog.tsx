import { useMemo, useState } from "react";
import { Sparkles, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Categorias sem conta contábil vinculada (código → nome). */
  pendingLabels: Record<string, string>;
  chartNames: Record<string, string>;
  onApplied: () => void;
};

export function SuggestChartAccountsDialog({
  open, onOpenChange, pendingLabels, chartNames, onApplied,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<ChartAccountSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const applicable = useMemo(
    () => suggestions.filter((s) => s.chart_account_code),
    [suggestions],
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
      setSelected(
        new Set(
          rows
            .filter((s) => s.chart_account_code && !s.requires_review)
            .map((s) => s.category_code),
        ),
      );
      if (rows.length === 0) {
        toast.success("Todas as categorias padrão já possuem conta contábil vinculada.");
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
    setApplying(true);
    let ok = 0;
    const failures: string[] = [];
    for (const s of toApply) {
      const { error } = await (supabase as any)
        .from("category_templates")
        .update({ chart_account_code: s.chart_account_code })
        .eq("code", s.category_code);
      if (error) failures.push(`${s.category_code}: ${error.message}`);
      else ok += 1;
    }
    setApplying(false);
    if (ok > 0) {
      toast.success(`${ok} vínculo(s) aplicado(s)`);
      setSuggestions((prev) => prev.filter((s) => !toApply.some((a) => a.category_code === s.category_code)));
      onApplied();
    }
    if (failures.length > 0) {
      toast.error(`${failures.length} sugestão(ões) recusada(s) pela validação`, {
        description: failures[0],
      });
    }
  };

  const pendingCount = Object.keys(pendingLabels).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Sugerir contas contábeis com IA
          </DialogTitle>
          <DialogDescription>
            O assistente lê o nome, o subtipo, as orientações e as palavras-chave de cada categoria e
            compara com o "como usar" e as palavras-chave das contas do plano V2. Revise antes de aplicar.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pendingCount} categoria(s) padrão sem conta contábil vinculada. O assistente analisa até 40 por rodada.
            </p>
            {loading ? (
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {suggestions.length > 0 && (
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
