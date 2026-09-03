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
  /** Empresa do usuário onde este mesmo cartão já está cadastrado (aviso de duplicidade). */
  other_company_name?: string | null;
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

    const rows = (data ?? []) as unknown as PluggyCreditReviewRow[];

    // Aviso: o mesmo cartão (últimos dígitos) já cadastrado em outra empresa
    // do usuário costuma indicar conexão feita na empresa errada.
    const withWarning = await Promise.all(rows.map(async (row) => {
      if (!row.number_masked) return row;
      const { data: otherCompany } = await supabase.rpc("credit_card_other_company", {
        _company_id: selectedCompanyId,
        _number: row.number_masked,
      });
      return { ...row, other_company_name: (otherCompany as string | null) ?? null };
    }));

    setPending(withWarning);
    setLoading(false);
  }, [contextType, selectedCompanyId]);

  useEffect(() => { reload(); }, [reload]);

  return { pending, loading, reload };
}

