export type TransactionDisplayStatus = "pago" | "a_vencer" | "atrasado";

export type LancamentoTransaction = {
  id: string;
  description: string;
  amount: number;
  transaction_type: "entrada" | "saida" | "transferencia";
  transaction_date: string;
  status: string;
  category_id: string | null;
  account_id: string;
  payment_method_id: string | null;
  due_date: string | null;
  amount_paid: number;
  bill_status: string | null;
  payment_date: string | null;
  contact_id: string | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
  payment_methods: { name: string } | null;
  notes: string | null;
  destination_account_id: string | null;
  is_recurring: boolean;
  parent_transaction_id: string | null;
  attachment_url: string | null;
  installment_number: number | null;
  installment_total: number | null;
};

export type LancamentoDisplayRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  transactionType: "entrada" | "saida" | "transferencia";
  installmentNumber: number | null;
  installmentTotal: number | null;
  categoryName: string | null;
  accountName: string | null;
  paymentMethodName: string | null;
  txStatus: string;
  billStatus: TransactionDisplayStatus;
  amountPaid: number;
  dueDate: string | null;
  paymentDate: string | null;
  runningBalance: number;
  hasDueDate: boolean;
  isRecurring: boolean;
  isRecurrenceChild: boolean;
  attachmentCount: number;
  original: LancamentoTransaction;
};

export const displayStatusConfig: Record<
  TransactionDisplayStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  pago: { label: "Pago", variant: "default" },
  a_vencer: { label: "A Vencer", variant: "secondary" },
  atrasado: { label: "Atrasado", variant: "destructive" },
};
