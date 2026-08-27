import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OriginChangeVersion {
  amount: number | null;
  transaction_date: string | null;
  description: string | null;
}

export interface OriginChange {
  id: string;
  transaction_id: string;
  staging_id: string | null;
  previous: OriginChangeVersion;
  incoming: OriginChangeVersion;
  created_at: string;
}

function asVersion(value: unknown): OriginChangeVersion {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    amount: v.amount === null || v.amount === undefined ? null : Number(v.amount),
    transaction_date: typeof v.transaction_date === "string" ? v.transaction_date : null,
    description: typeof v.description === "string" ? v.description : null,
  };
}

/**
 * Revisões abertas quando o banco altera, na origem, um lançamento que já foi
 * conciliado. O lançamento nunca é alterado em silêncio: o usuário aceita a
 * nova versão ou mantém a atual.
 */
export function useOriginChanges(companyId: string | null) {
  const [changes, setChanges] = useState<OriginChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setChanges([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("transaction_origin_changes")
      .select("id, transaction_id, staging_id, previous, incoming, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      setChanges([]);
      return;
    }
    setChanges(
      (data ?? []).map((row) => ({
        id: row.id,
        transaction_id: row.transaction_id,
        staging_id: row.staging_id,
        previous: asVersion(row.previous),
        incoming: asVersion(row.incoming),
        created_at: row.created_at,
      })),
    );
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = useCallback(
    async (changeId: string, accept: boolean, note?: string) => {
      setResolvingId(changeId);
      const { error } = await supabase.rpc("resolve_transaction_origin_change", {
        _change_id: changeId,
        _accept: accept,
        _note: note ?? undefined,
      });
      setResolvingId(null);
      if (error) {
        toast.error("Não foi possível resolver a revisão");
        return false;
      }
      toast.success(accept ? "Nova versão do banco aplicada" : "Lançamento atual mantido");
      await load();
      return true;
    },
    [load],
  );

  return { changes, loading, resolvingId, resolve, reload: load };
}
