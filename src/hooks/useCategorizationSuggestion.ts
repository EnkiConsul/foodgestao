import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CategorizationSuggestion = {
  category_id: string | null;
  payment_method_id: string | null;
  confidence: number;
  layer: "deterministic" | "similarity";
  rule_id: string;
  match_type: string;
  pattern: string;
  similarity: number | null;
};

type Args = {
  description: string;
  transactionType?: string | null;
  context?: "pf" | "pj" | null;
  companyId?: string | null;
  enabled?: boolean;
  minLength?: number;
  debounceMs?: number;
};

/**
 * Debounced call to the `categorize_transaction` RPC.
 * Returns the best suggestion (deterministic > similarity) or null.
 */
export function useCategorizationSuggestion({
  description,
  transactionType,
  context,
  companyId,
  enabled = true,
  minLength = 3,
  debounceMs = 350,
}: Args) {
  const [suggestion, setSuggestion] = useState<CategorizationSuggestion | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }
    const desc = (description ?? "").trim();
    if (desc.length < minLength) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("categorize_transaction", {
        p_description: desc,
        p_transaction_type: transactionType ?? undefined,
        p_context: context ? context.toUpperCase() : undefined,
        p_company_id: companyId ?? undefined,
        p_user_id: undefined,
        p_min_similarity: 0.45,
      });
      if (cancelled) return;
      setLoading(false);
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setSuggestion(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setSuggestion(row as CategorizationSuggestion);
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      setLoading(false);
    };
  }, [description, transactionType, context, companyId, enabled, minLength, debounceMs]);

  const applyHit = async (ruleId: string) => {
    try {
      await supabase.rpc("increment_rule_hit", { p_rule_id: ruleId });
    } catch {
      /* silent */
    }
  };

  return { suggestion, loading, applyHit };
}
