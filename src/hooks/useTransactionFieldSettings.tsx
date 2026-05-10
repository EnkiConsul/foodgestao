import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type TransactionField =
  | "category"
  | "contact"
  | "payment_method"
  | "due_date"
  | "payment_date"
  | "notes"
  | "attachments";

export const TRANSACTION_FIELD_LABELS: Record<TransactionField, string> = {
  category: "Categoria",
  contact: "Cliente/Fornecedor",
  payment_method: "Forma de pagamento",
  due_date: "Data de vencimento",
  payment_date: "Data de pagamento",
  notes: "Observações",
  attachments: "Anexos",
};

export const TRANSACTION_FIELDS: TransactionField[] = [
  "category",
  "contact",
  "payment_method",
  "due_date",
  "payment_date",
  "notes",
  "attachments",
];

export type FieldRequirement = "required" | "optional";
export type TransactionFieldSettings = Partial<Record<TransactionField, FieldRequirement>>;

export function useTransactionFieldSettings() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["transaction-field-settings", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<TransactionFieldSettings> => {
      const { data } = await supabase
        .from("profiles")
        .select("transaction_field_settings")
        .eq("user_id", user!.id)
        .single();
      return ((data?.transaction_field_settings as TransactionFieldSettings) ?? {}) as TransactionFieldSettings;
    },
  });

  const settings = query.data ?? {};
  const isRequired = (field: TransactionField) => settings[field] === "required";

  return { settings, isRequired, isLoading: query.isLoading };
}
