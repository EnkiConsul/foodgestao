import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseEdgeFunctionError, formatEdgeFunctionError } from "@/lib/edgeFunctionError";

export class EdgeFunctionError extends Error {
  code: string;
  status: number | null;
  details?: unknown;
  constructor(info: { code: string; status: number | null; message: string; details?: unknown }) {
    super(info.message);
    this.code = info.code;
    this.status = info.status;
    this.details = info.details;
  }
}

async function throwEdge(err: unknown, fallback: string): Promise<never> {
  const info = await parseEdgeFunctionError(err, fallback);
  throw new EdgeFunctionError(info);
}

function describeEdgeError(err: Error): string {
  if (err instanceof EdgeFunctionError) {
    return formatEdgeFunctionError({
      code: err.code,
      status: err.status,
      message: err.message,
      details: err.details,
    });
  }
  return err.message;
}

export type OpenFinanceConnection = {
  id: string;
  company_id: string;
  institution_name: string | null;
  institution_logo_url: string | null;
  institution_primary_color: string | null;
  item_status: string | null;
  execution_status: string | null;
  provider_error_message: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  next_auto_sync_at: string | null;
  is_active: boolean;
  disconnected_at: string | null;
  needs_reconnect: boolean;
  created_at: string;
};

export type OpenFinanceAccount = {
  id: string;
  connection_id: string;
  provider_type: string;
  provider_subtype: string | null;
  provider_name: string | null;
  provider_marketing_name: string | null;
  provider_number_masked: string | null;
  currency_code: string | null;
  provider_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  available_credit_limit: number | null;
  card_brand: string | null;
  local_account_id: string | null;
  local_credit_card_id: string | null;
  ownership_status: string;
  auto_import: boolean;
  is_active: boolean;
  last_synced_at: string | null;
};

export function useOpenFinanceConnections(companyId: string | null) {
  return useQuery({
    queryKey: ["of-connections", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<OpenFinanceConnection[]> => {
      const { data, error } = await supabase
        .from("open_finance_connections")
        .select(
          "id, company_id, institution_name, institution_logo_url, institution_primary_color, item_status, execution_status, provider_error_message, last_sync_at, last_successful_sync_at, next_auto_sync_at, is_active, disconnected_at, needs_reconnect, created_at",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenFinanceConnection[];
    },
  });
}

export function useOpenFinanceAccounts(connectionId: string | null) {
  return useQuery({
    queryKey: ["of-accounts", connectionId],
    enabled: !!connectionId,
    queryFn: async (): Promise<OpenFinanceAccount[]> => {
      const { data, error } = await supabase
        .from("open_finance_accounts")
        .select(
          "id, connection_id, provider_type, provider_subtype, provider_name, provider_marketing_name, provider_number_masked, currency_code, provider_balance, available_balance, credit_limit, available_credit_limit, card_brand, local_account_id, local_credit_card_id, ownership_status, auto_import, is_active, last_synced_at",
        )
        .eq("connection_id", connectionId!)
        .order("provider_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpenFinanceAccount[];
    },
  });
}

export function useCreateConnectToken() {
  return useMutation({
    mutationFn: async (input: {
      company_id: string;
      mode: "create" | "update" | "renew_consent";
      connection_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-connect-token", {
        body: input,
      });
      if (error) await throwEdge(error, "Falha ao criar token Pluggy");
      if (!data?.access_token) {
        throw new EdgeFunctionError({
          code: data?.error || "no_access_token",
          status: null,
          message: data?.error
            ? `Token Pluggy indisponível (código: ${data.error}).`
            : "Token Pluggy indisponível.",
        });
      }
      return data as { access_token: string; request_id: string; expires_at: string };
    },
    onError: (err: Error) => {
      toast.error("Não foi possível iniciar a conexão", { description: describeEdgeError(err) });
    },
  });
}

export function useRegisterPluggyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { request_id: string; item_id: string }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-item-register", {
        body: input,
      });
      if (error) await throwEdge(error, "Falha ao registrar conexão");
      if (!data?.ok) {
        throw new EdgeFunctionError({
          code: data?.error || "register_refused",
          status: null,
          message: data?.error
            ? `Registro recusado (código: ${data.error}).`
            : "Registro recusado.",
        });
      }
      return data as { connection_id: string; accounts_synced: number; item_status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["of-connections"] });
      toast.success("Banco conectado com sucesso");
    },
    onError: (err: Error) => {
      toast.error("Falha ao registrar conexão", { description: describeEdgeError(err) });
    },
  });
}

export function useDeletePluggyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connection_id: string }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-item-delete", {
        body: input,
      });
      if (error) await throwEdge(error, "Falha ao desconectar");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["of-connections"] });
      toast.success("Banco desconectado");
    },
    onError: (err: Error) => {
      toast.error("Falha ao desconectar", { description: describeEdgeError(err) });
    },
  });
}

export function useReconcileConnections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { company_id: string; item_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-reconcile", {
        body: input,
      });
      if (error) await throwEdge(error, "Falha ao recuperar conexões");
      if (data?.error) {
        throw new EdgeFunctionError({
          code: data.error,
          status: null,
          message: `Recuperação falhou (código: ${data.error}).`,
          details: data.details,
        });
      }
      return data as {
        ok: boolean;
        recovered: number;
        item_ids: string[];
        total_pluggy_items: number;
        errors: Array<{ item_id: string; error: string }>;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["of-connections"] });
      qc.invalidateQueries({ queryKey: ["of-accounts"] });
      if (data.recovered > 0) {
        toast.success(
          data.recovered === 1
            ? "1 conexão recuperada"
            : `${data.recovered} conexões recuperadas`,
          {
            description:
              data.errors.length > 0
                ? `${data.errors.length} item(ns) com erro — verifique os logs.`
                : "Sincronize agora para importar os lançamentos.",
          },
        );
      } else {
        toast.info("Nenhuma conexão pendente encontrada", {
          description:
            data.total_pluggy_items > 0
              ? "Todos os itens do Pluggy já estão registrados."
              : "Nenhum item ativo no Pluggy para essa empresa.",
        });
      }
    },
    onError: (err: Error) => {
      toast.error("Falha ao recuperar conexões", { description: describeEdgeError(err) });
    },
  });
}

export function useTriggerPluggySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connection_id: string; trigger?: string }) => {
      const { data, error } = await supabase.functions.invoke("pluggy-sync", {
        body: { connection_id: input.connection_id, trigger: input.trigger ?? "manual" },
      });
      if (error) await throwEdge(error, "Falha ao sincronizar");
      if (data?.error) {
        throw new EdgeFunctionError({
          code: data.error,
          status: null,
          message: `Sincronização falhou (código: ${data.error}).`,
        });
      }
      return data as {
        ok: boolean;
        run_id: string;
        status: "success" | "partial" | "failed";
        accounts_processed: number;
        fetched: number;
        ingested: number;
        errors: number;
        expired?: number;
        paired?: number;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["of-connections"] });
      qc.invalidateQueries({ queryKey: ["of-accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      const label =
        data.status === "success"
          ? "Sincronização concluída"
          : data.status === "partial"
          ? "Sincronização concluída com avisos"
          : "Sincronização falhou";
      const extras: string[] = [];
      if (data.paired && data.paired > 0) extras.push(`${data.paired} transferências pareadas`);
      if (data.expired && data.expired > 0) extras.push(`${data.expired} candidatos expirados`);
      toast.success(label, {
        description: [
          `${data.ingested} lançamentos importados · ${data.errors} erros`,
          ...extras,
        ].join(" · "),
      });
    },
    onError: (err: Error) => {
      toast.error("Falha ao sincronizar", { description: describeEdgeError(err) });
    },
  });
}

export type LocalBankAccountOption = {
  id: string;
  name: string;
  account_type: string;
  bank_slug: string | null;
};

export type LocalCreditCardOption = {
  id: string;
  name: string;
  brand: string | null;
  last4: string | null;
};

export function useLocalBankAccounts(companyId: string | null) {
  return useQuery({
    queryKey: ["local-bank-accounts", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<LocalBankAccountOption[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, account_type, bank_slug")
        .eq("company_id", companyId!)
        .eq("context", "pj")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as LocalBankAccountOption[];
    },
  });
}

export function useLocalCreditCards(companyId: string | null) {
  return useQuery({
    queryKey: ["local-credit-cards", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<LocalCreditCardOption[]> => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("id, holder_name, brand, last4, issuer")
        .eq("company_id", companyId!)
        .eq("context", "pj")
        .eq("is_active", true)
        .order("holder_name");
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string;
        holder_name: string | null;
        brand: string | null;
        last4: string | null;
        issuer: string | null;
      }>).map((c) => ({
        id: c.id,
        name: [c.issuer, c.holder_name].filter(Boolean).join(" · ") || "Cartão",
        brand: c.brand,
        last4: c.last4,
      }));
    },
  });
}

export function useLinkOpenFinanceAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      of_account_id: string;
      local_account_id?: string | null;
      local_credit_card_id?: string | null;
      auto_import?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("link_open_finance_account", {
        _of_account_id: input.of_account_id,
        _local_account_id: input.local_account_id ?? null,
        _local_credit_card_id: input.local_credit_card_id ?? null,
        _auto_import: input.auto_import ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["of-accounts"] });
      toast.success("Vínculo atualizado");
    },
    onError: (err: Error) => {
      toast.error("Falha ao vincular", { description: err.message });
    },
  });
}

// ============================================================================
// Bloco 8/9 — Revisão de transferências expiradas (pairing_status='expired_review')
// ============================================================================

export type PairingReviewRow = {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
  transaction_type: "receita" | "despesa" | "transferencia";
  counterparty_name: string | null;
  counterparty_cnpj: string | null;
  account_id: string | null;
  connection_account_id: string | null;
};

export function usePairingReview(companyId: string | null) {
  return useQuery({
    queryKey: ["of-pairing-review", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, transaction_date, transaction_type, counterparty_name, counterparty_cnpj, account_id, connection_account_id")
        .eq("company_id", companyId!)
        .eq("pairing_status", "expired_review")
        .order("transaction_date", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as PairingReviewRow[];
    },
  });
}

export function useResolvePairingReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { transaction_id: string; action: "keep" | "exclude" }) => {
      const patch =
        input.action === "keep"
          ? {
              pairing_status: "expired_finalized",
              exclude_from_results: false,
              needs_review: false,
              review_reason: null,
            }
          : {
              pairing_status: "expired_finalized",
              exclude_from_results: true,
              needs_review: false,
              review_reason: "confirmado_transferencia_sem_par",
            };
      const { error } = await supabase
        .from("transactions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", input.transaction_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["of-pairing-review"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Lançamento atualizado");
    },
    onError: (err: Error) => {
      toast.error("Falha ao atualizar", { description: err.message });
    },
  });
}

