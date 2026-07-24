import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

/**
 * Status agregado de Open Finance para exibir badges no card de uma conta local.
 *
 * - `connected`: sincronizando normalmente.
 * - `needs_reconnect`: item precisa reautenticar (MFA / consentimento expirado).
 * - `consent_expiring`: consentimento vence em ≤ 15 dias.
 * - `error`: connector_status/execution_status reportou erro persistente.
 * - `none`: conta 100% manual (sem vínculo OF).
 */
export type OpenFinanceAccountStatus =
  | "connected"
  | "needs_reconnect"
  | "consent_expiring"
  | "error"
  | "none";

export interface AccountOFInfo {
  status: OpenFinanceAccountStatus;
  institution?: string | null;
  lastSyncAt?: string | null;
  consentExpiresAt?: string | null;
  daysToExpire?: number | null;
  connectionId?: string | null;
}

const EXPIRE_THRESHOLD_DAYS = 15;

export function useAccountOpenFinanceStatus() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [map, setMap] = useState<Record<string, AccountOFInfo>>({});

  const fetchStatus = useCallback(async () => {
    if (contextType !== "pj" || !selectedCompanyId) {
      setMap({});
      return;
    }
    const { data, error } = await supabase
      .from("open_finance_accounts")
      .select(
        `id, local_account_id, local_credit_card_id, last_synced_at,
         connection:open_finance_connections!inner(
           id, institution_name, needs_reconnect, consent_expires_at,
           item_status, execution_status, connector_status, is_active
         )`,
      )
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true);

    if (error || !data) {
      setMap({});
      return;
    }

    const result: Record<string, AccountOFInfo> = {};
    for (const row of data as any[]) {
      const key = row.local_account_id ?? row.local_credit_card_id;
      if (!key) continue;
      const conn = row.connection;
      if (!conn?.is_active) continue;

      let status: OpenFinanceAccountStatus = "connected";
      let daysToExpire: number | null = null;

      if (conn.consent_expires_at) {
        const diff = Math.floor(
          (new Date(conn.consent_expires_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        );
        daysToExpire = diff;
        if (diff <= EXPIRE_THRESHOLD_DAYS) status = "consent_expiring";
      }
      if (conn.needs_reconnect) status = "needs_reconnect";
      const errBad = ["ERROR", "LOGIN_ERROR", "OUTDATED"];
      if (
        errBad.includes(String(conn.item_status ?? "").toUpperCase()) ||
        errBad.includes(String(conn.execution_status ?? "").toUpperCase())
      ) {
        status = "error";
      }

      result[key] = {
        status,
        institution: conn.institution_name,
        lastSyncAt: row.last_synced_at,
        consentExpiresAt: conn.consent_expires_at,
        daysToExpire,
        connectionId: conn.id,
      };
    }
    setMap(result);
  }, [contextType, selectedCompanyId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useRealtimeSync({
    tables: ["open_finance_accounts", "open_finance_connections"],
    onChange: () => fetchStatus(),
  });

  return { statusByAccountId: map, refresh: fetchStatus };
}
