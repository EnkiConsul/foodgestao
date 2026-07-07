import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";

export interface BankConnection {
  id: string;
  provider: string;
  provider_item_id: string;
  institution_name: string | null;
  institution_logo_url: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  consent_expires_at: string | null;
  context: "pf" | "pj";
  company_id: string | null;
}

export interface BankConnectionAccount {
  id: string;
  connection_id: string;
  provider_account_id: string;
  provider_name: string | null;
  provider_number: string | null;
  provider_type: string | null;
  provider_subtype: string | null;
  provider_balance: number | null;
  currency_code: string | null;
  account_id: string | null;
  auto_import: boolean;
  last_synced_at: string | null;
}

export function useBankConnections() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  const connectionsQuery = useQuery({
    queryKey: ["bank-connections", contextType, selectedCompanyId, user?.id],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      let query = supabase
        .from("bank_connections")
        .select("*")
        .eq("provider", "pluggy")
        .order("created_at", { ascending: false });
      if (contextType === "pj") {
        query = query.eq("context", "pj").eq("company_id", selectedCompanyId!);
      } else {
        query = query.eq("context", "pf").is("company_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as BankConnection[];
    },
  });

  const accountsQuery = useQuery({
    queryKey: [
      "bank-connection-accounts",
      (connectionsQuery.data ?? []).map((c) => c.id).join(","),
    ],
    enabled: (connectionsQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (connectionsQuery.data ?? []).map((c) => c.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("bank_connection_accounts")
        .select("*")
        .in("connection_id", ids);
      if (error) throw error;
      return (data ?? []) as BankConnectionAccount[];
    },
  });

  return { connectionsQuery, accountsQuery };
}

export function usePluggyActions() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bank-connections"] });
    qc.invalidateQueries({ queryKey: ["bank-connection-accounts"] });
  };

  const registerItem = useMutation({
    mutationFn: async (vars: {
      itemId: string;
      context: "pf" | "pj";
      companyId: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-register-item", {
        body: vars,
      });
      if (error) throw error;
      return data as { connectionId: string; accounts: number };
    },
    onSuccess: invalidate,
  });

  const syncConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke("pluggy-sync-connection", {
        body: { connectionId },
      });
      if (error) throw error;
      return data as { imported: number; error: string | null };
    },
    onSuccess: invalidate,
  });

  const deleteConnection = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke("pluggy-delete-connection", {
        body: { connectionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const linkProviderAccount = useMutation({
    mutationFn: async (vars: { connAccountId: string; accountId: string | null }) => {
      const { error } = await supabase.rpc("pluggy_link_provider_account", {
        _conn_account_id: vars.connAccountId,
        _account_id: vars.accountId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleAutoImport = useMutation({
    mutationFn: async (vars: { connAccountId: string; autoImport: boolean }) => {
      const { error } = await supabase
        .from("bank_connection_accounts")
        .update({ auto_import: vars.autoImport })
        .eq("id", vars.connAccountId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { registerItem, syncConnection, deleteConnection, linkProviderAccount, toggleAutoImport };
}

export async function requestConnectToken(itemId?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("pluggy-connect-token", {
    body: itemId ? { itemId } : {},
  });
  if (error) throw error;
  return (data as { accessToken: string }).accessToken;
}
