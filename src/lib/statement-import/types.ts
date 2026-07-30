export type ParsedStatementEntry = {
  /** ISO date yyyy-mm-dd */
  date: string;
  /** Raw description from statement (title + counterparty) */
  description: string;
  /** Positive number in reais */
  amount: number;
  /** receita = credit / despesa = debit */
  transaction_type: "entrada" | "saida";
  /** Counterparty document (CNPJ/CPF), when detected */
  counterparty_document?: string | null;
  /** Counterparty name when detected */
  counterparty_name?: string | null;
  /** Deterministic hash for idempotency */
  import_hash: string;
};

export type ImportSuggestion = {
  category_id: string | null;
  contact_id: string | null;
  /** Source of the suggestion, for UI hint */
  source: "history" | "document" | "keyword" | null;
};

export type ReviewRow = ParsedStatementEntry &
  ImportSuggestion & {
    include: boolean;
    duplicate: boolean;
    duplicate_kind?: "existing" | "file" | null;
    /** Overridable by user */
    description_override?: string | null;
  };
