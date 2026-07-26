import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, ArrowLeft, Check, Ban, Loader2, RefreshCw, Wallet2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface RawRow {
  id: string;
  company_id: string;
  connection_id: string;
  of_account_id: string;
  pluggy_transaction_id: string;
  raw: any;
  created_at: string;
  local_account_id: string | null;
  account_name: string | null;
  institution_name: string | null;
}

interface Suggestion {
  category_id: string;
  category_name: string;
  confidence: number;
}

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function ConciliacaoOpenFinance() {
  const navigate = useNavigate();
  const { activeCompanyId } = useCompanyContext();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [processing, setProcessing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("open_finance_transactions_raw")
      .select(`
        id, company_id, connection_id, of_account_id, pluggy_transaction_id, raw, created_at,
        of_account:open_finance_accounts!open_finance_transactions_raw_of_account_id_fkey(
          local_account_id,
          name,
          connection:open_finance_connections!open_finance_accounts_connection_id_fkey(institution_name)
        )
      `)
      .eq("company_id", activeCompanyId)
      .is("processed_at", null)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      toast.error("Falha ao carregar", { description: error.message });
      setLoading(false);
      return;
    }

    const mapped: RawRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      company_id: r.company_id,
      connection_id: r.connection_id,
      of_account_id: r.of_account_id,
      pluggy_transaction_id: r.pluggy_transaction_id,
      raw: r.raw,
      created_at: r.created_at,
      local_account_id: r.of_account?.local_account_id ?? null,
      account_name: r.of_account?.name ?? null,
      institution_name: r.of_account?.connection?.institution_name ?? null,
    }));

    setRows(mapped);
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectableIds = useMemo(
    () => rows.filter(r => r.local_account_id).map(r => r.id),
    [rows],
  );

  const toggleAll = () => {
    if (selected.size === selectableIds.length) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };

  const runAiSuggest = async () => {
    if (!activeCompanyId || rows.length === 0) return;
    setAiLoading(true);
    try {
      const items = rows.slice(0, 50).map(r => {
        const amount = Number(r.raw?.amount ?? 0);
        const type = String(r.raw?.type ?? "").toUpperCase() === "CREDIT" || amount >= 0 ? "receita" : "despesa";
        return {
          id: r.id,
          description: String(r.raw?.description ?? r.raw?.descriptionRaw ?? "").slice(0, 200),
          amount: Math.abs(amount),
          type,
        };
      });
      const { data, error } = await supabase.functions.invoke("of-ai-suggest", {
        body: { company_id: activeCompanyId, items },
      });
      if (error) throw error;
      const map: Record<string, Suggestion> = {};
      for (const s of (data?.suggestions ?? []) as any[]) {
        map[s.id] = { category_id: s.category_id, category_name: s.category_name, confidence: s.confidence };
      }
      setSuggestions(map);
      toast.success(`${Object.keys(map).length} sugestões geradas`);
    } catch (err: any) {
      toast.error("Falha na sugestão IA", { description: err?.message });
    } finally {
      setAiLoading(false);
    }
  };

  const promote = async (ids: string[]) => {
    if (ids.length === 0) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc("promote_open_finance_raw_ids", { _raw_ids: ids });
      if (error) throw error;
      const d = data as any;
      toast.success("Lançamentos promovidos", {
        description: `Inseridos: ${d?.inserted ?? 0} · Duplicados: ${d?.duplicates ?? 0} · Ignorados: ${d?.skipped ?? 0} · Erros: ${d?.errors ?? 0}`,
      });

      // Aplica categorias sugeridas nas transactions recém-criadas
      const suggestedIds = ids.filter(id => suggestions[id]);
      if (suggestedIds.length > 0) {
        const { data: created } = await supabase
          .from("open_finance_transactions_raw")
          .select("id, transaction_id")
          .in("id", suggestedIds);
        const updates = (created ?? [])
          .filter((r: any) => r.transaction_id && suggestions[r.id])
          .map((r: any) => supabase.from("transactions").update({ category_id: suggestions[r.id].category_id, categorization_source: "ai" }).eq("id", r.transaction_id));
        await Promise.all(updates);
      }

      setSelected(new Set());
      await load();
    } catch (err: any) {
      toast.error("Falha ao promover", { description: err?.message });
    } finally {
      setProcessing(false);
    }
  };

  const ignore = async (ids: string[]) => {
    if (ids.length === 0) return;
    setProcessing(true);
    try {
      const { error } = await supabase.rpc("ignore_open_finance_raw", { _raw_ids: ids });
      if (error) throw error;
      toast.success(`${ids.length} lançamento(s) ignorado(s)`);
      setSelected(new Set());
      await load();
    } catch (err: any) {
      toast.error("Falha ao ignorar", { description: err?.message });
    } finally {
      setProcessing(false);
    }
  };

  const withoutAccount = rows.filter(r => !r.local_account_id).length;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/contas-bancarias/conexoes")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Central de Conciliação</h1>
            <p className="text-sm text-muted-foreground">
              Revise, categorize com IA e promova lançamentos Open Finance para o financeiro.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="secondary" size="sm" onClick={runAiSuggest} disabled={aiLoading || rows.length === 0}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Sugerir com IA
          </Button>
        </div>
      </div>

      {withoutAccount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{withoutAccount} lançamento(s) sem conta vinculada</AlertTitle>
          <AlertDescription>
            Vincule a conta Pluggy correspondente em <b>Conexões Open Finance</b> para poder promovê-los.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">
            Pendentes ({rows.length})
          </CardTitle>
          {selected.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => promote(Array.from(selected))} disabled={processing}>
                <Check className="h-4 w-4 mr-1" /> Promover {selected.size}
              </Button>
              <Button size="sm" variant="outline" onClick={() => ignore(Array.from(selected))} disabled={processing}>
                <Ban className="h-4 w-4 mr-1" /> Ignorar {selected.size}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Wallet2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
              Nenhum lançamento pendente de conciliação.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 w-8">
                      <Checkbox
                        checked={selectableIds.length > 0 && selected.size === selectableIds.length}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Descrição</th>
                    <th className="p-2 text-left">Conta</th>
                    <th className="p-2 text-right">Valor</th>
                    <th className="p-2 text-left">Sugestão IA</th>
                    <th className="p-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const amount = Number(r.raw?.amount ?? 0);
                    const isCredit = String(r.raw?.type ?? "").toUpperCase() === "CREDIT" || amount >= 0;
                    const desc = r.raw?.description ?? r.raw?.descriptionRaw ?? "—";
                    const date = r.raw?.date ? format(new Date(r.raw.date), "dd/MM/yy", { locale: ptBR }) : "—";
                    const sug = suggestions[r.id];
                    const disabled = !r.local_account_id;
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={() => toggle(r.id)}
                            disabled={disabled}
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">{date}</td>
                        <td className="p-2 max-w-xs truncate" title={desc}>{desc}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.account_name ?? "—"}
                          {r.institution_name && <div>{r.institution_name}</div>}
                          {disabled && <Badge variant="outline" className="mt-1">Sem vínculo</Badge>}
                        </td>
                        <td className={`p-2 text-right whitespace-nowrap font-medium ${isCredit ? "text-green-600" : "text-red-600"}`}>
                          {isCredit ? "+" : "-"} {currency(Math.abs(amount))}
                        </td>
                        <td className="p-2">
                          {sug ? (
                            <div className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-primary" />
                              <span className="text-xs">{sug.category_name}</span>
                              <Badge variant="secondary" className="text-[10px]">{Math.round(sug.confidence * 100)}%</Badge>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => promote([r.id])} disabled={disabled || processing} title="Promover">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => ignore([r.id])} disabled={processing} title="Ignorar">
                            <Ban className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
