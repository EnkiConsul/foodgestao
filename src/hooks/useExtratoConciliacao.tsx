import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ExtratoStagingLike, ExtratoTxLike } from "@/lib/conciliacao/extrato";

const PAGE = 1000;

export interface ExtratoConciliacaoFiltros {
  companyId: string | null;
  from: string;
  to: string;
  /** conta Pluggy (escopo por conta financeira) */
  pluggyAccountId?: string | null;
  connectionId?: string | null;
}

interface JoinedTx {
  id: string;
  pluggy_staging_transaction_id: string | null;
  description: string | null;
  amount: number;
  transaction_type: string | null;
  transaction_date: string | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
  payment_methods: { name: string } | null;
  contacts: { name: string } | null;
}

/**
 * Busca as linhas do extrato (staging da Pluggy) do período e as transações da
 * plataforma vinculadas a elas. A busca é paginada para suportar períodos longos.
 */
export function useExtratoConciliacao(filtros: ExtratoConciliacaoFiltros) {
  const { companyId, from, to, pluggyAccountId, connectionId } = filtros;
  const [staging, setStaging] = useState<ExtratoStagingLike[]>([]);
  const [transactions, setTransactions] = useState<ExtratoTxLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setStaging([]);
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows: ExtratoStagingLike[] = [];
      for (let page = 0; ; page++) {
        let q = supabase
          .from("pluggy_staging_transactions")
          .select("id, date, description, amount, status, matched_transaction_id, pluggy_account_id, connection_id")
          .eq("company_id", companyId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (pluggyAccountId) q = q.eq("pluggy_account_id", pluggyAccountId);
        else if (connectionId) q = q.eq("connection_id", connectionId);

        const { data, error: err } = await q;
        if (err) throw err;
        rows.push(...((data ?? []) as ExtratoStagingLike[]));
        if (!data || data.length < PAGE) break;
      }
      setStaging(rows);

      // O vínculo real é feito por staging.matched_transaction_id (a coluna
      // transactions.pluggy_staging_transaction_id não é preenchida na confirmação),
      // então buscamos as transações pelos dois caminhos.
      const stagingIds = rows.map((r) => r.id);
      const matchedIds = Array.from(
        new Set(rows.map((r) => r.matched_transaction_id).filter((v): v is string => Boolean(v))),
      );
      const txs: ExtratoTxLike[] = [];
      const seen = new Set<string>();
      const SELECT =
        "id, pluggy_staging_transaction_id, description, amount, transaction_type, transaction_date, categories!fk_transactions_category(name), accounts!fk_transactions_account(name), payment_methods!fk_transactions_payment_method(name), contacts!fk_transactions_contact(name)";

      const pushRows = (data: unknown[] | null) => {
        for (const t of (data ?? []) as unknown as JoinedTx[]) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          txs.push({
            id: t.id,
            pluggy_staging_transaction_id: t.pluggy_staging_transaction_id,
            description: t.description,
            amount: Number(t.amount ?? 0),
            transaction_type: t.transaction_type,
            date: t.transaction_date,
            category_name: t.categories?.name ?? null,
            account_name: t.accounts?.name ?? null,
            payment_method_name: t.payment_methods?.name ?? null,
            contact_name: t.contacts?.name ?? null,
          });
        }
      };

      for (let i = 0; i < matchedIds.length; i += 200) {
        const chunk = matchedIds.slice(i, i + 200);
        const { data, error: err } = await supabase
          .from("transactions")
          .select(SELECT)
          .eq("company_id", companyId)
          .in("id", chunk);
        if (err) throw err;
        pushRows(data as unknown[]);
      }

      for (let i = 0; i < stagingIds.length; i += 200) {
        const chunk = stagingIds.slice(i, i + 200);
        const { data, error: err } = await supabase
          .from("transactions")
          .select(SELECT)
          .eq("company_id", companyId)
          .in("pluggy_staging_transaction_id", chunk);
        if (err) throw err;
        pushRows(data as unknown[]);
      }


      setTransactions(txs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o extrato");
      setStaging([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, from, to, pluggyAccountId, connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { staging, transactions, loading, error, reload: load };
}
