import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface PluggyCreditReviewRow {
  id: string;
  pluggy_account_id: string;
  connection_id: string;
  name: string | null;
  number_masked: string | null;
  balance: number | null;
  raw: unknown;
  credit_review_status: string | null;
  linked_credit_card_id: string | null;
}

/**
 * Cartões de crédito detectados no Open Finance que aguardam autorização
 * do usuário antes de virarem cadastro em `credit_cards`.
 */
export function usePluggyCreditReview() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [pending, setPending] = useState<PluggyCreditReviewRow[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (contextType !== "pj" || !selectedCompanyId) {
      setPending([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("pluggy_accounts")
      .select("id, pluggy_account_id, connection_id, name, number_masked, balance, raw, credit_review_status, linked_credit_card_id")
      .eq("company_id", selectedCompanyId)
      .eq("credit_review_status", "pending")
      .is("linked_credit_card_id", null)
      .order("created_at", { ascending: false });
    setPending((data ?? []) as unknown as PluggyCreditReviewRow[]);
    setLoading(false);
  }, [contextType, selectedCompanyId]);

  useEffect(() => { reload(); }, [reload]);

  return { pending, loading, reload };
}
