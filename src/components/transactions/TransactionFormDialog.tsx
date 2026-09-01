import { useState, useEffect, useRef, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { transactionSchema } from "@/lib/validations";
import { getSignedAttachmentUrl } from "@/lib/attachments";
import { Calendar, Repeat, X, FileText, Upload, CheckCircle, Clock, XCircle, Plus, Wallet, CreditCard, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AccountFormDialog } from "@/components/accounts/AccountFormDialog";

import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import {
  CategoryGuidancePanel,
  CategoryGuidanceTooltip,
  type CategoryGuidance,
} from "@/components/categories/CategoryGuidanceHint";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { toProperName } from "@/lib/text/properName";
import { PaymentMethodFormDialog } from "@/components/payment-methods/PaymentMethodFormDialog";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useTransactionFieldSettings, TRANSACTION_FIELD_LABELS, type TransactionField } from "@/hooks/useTransactionFieldSettings";
import { useTransactionFormLookups } from "@/hooks/useTransactionFormLookups";
import { useCategorizationSuggestion } from "@/hooks/useCategorizationSuggestion";
import { recommendCategories, type RecommendCategoryInput } from "@/lib/categories/recommend";
import { CategoryRecommendationHint } from "@/components/categories/CategoryRecommendationHint";
import { Sparkles } from "lucide-react";
import {
  type CategoryNode,
  buildCategoryTree,
  generateRecurrenceDates,
  getNextRecurrenceDate,
  WEEKDAYS,
  parseLocalDate,
  shiftToWeekday,
  currentWeekday,
  lastDayOfMonth,
  shiftToMonthDay,
  currentMonthDay,
  MONTH_DAYS,
  formatBR,
  buildOccurrencePreview,
} from "@/lib/transactions/formHelpers";
import { assignPurchaseToInvoice, toYmd } from "@/lib/credit-card/cycle";

type TransactionType = "entrada" | "saida" | "transferencia";

interface EditableTransaction {
  id: string;
  description: string;
  amount: number;
  transaction_type: TransactionType;
  transaction_date: string;
  account_id: string | null;
  credit_card_id?: string | null;
  destination_account_id?: string | null;
  category_id?: string | null;
  contact_id?: string | null;
  notes?: string | null;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_type?: string | null;
  recurrence_end_date?: string | null;
  attachment_url?: string | null;
  status?: string;
  amount_paid?: number;
  payment_method_id?: string | null;
  payment_date?: string | null;
  cost_center_id?: string | null;
  parent_transaction_id?: string | null;
  installment_number?: number | null;
  installment_total?: number | null;
}

export type EditScope = "single" | "forward" | "all";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  transaction?: EditableTransaction | null;
  initialType?: TransactionType;
  editScope?: EditScope;
  /** Pré-preenche o formulário em modo criação (usado ao duplicar um lançamento). */
  duplicateSource?: EditableTransaction | null;
}


const MAX_ATTACHMENTS = 5;

export function TransactionFormDialog({ open, onOpenChange, onCreated, transaction, initialType, editScope = "single", duplicateSource }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  
  const { isRequired } = useTransactionFieldSettings();
  const {
    accounts,
    categories,
    contacts,
    paymentMethods,
    creditCards,
    categoryCompanyIds,
    contactCompanyIds,
    paymentMethodCompanyIds,
    costCenters,
    costCenterCompanyIds,
    invalidateLookups,
  } = useTransactionFormLookups(open);
  const [type, setType] = useState<TransactionType>("saida");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toYmd(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"confirmado" | "pendente" | "cancelado">("confirmado");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("mensal");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<{ id: string; file_name: string; file_url: string }[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");

  // Parcelado (modificador de receita/despesa, mutex com Recorrente)
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState<number>(2);
  const [installmentMode, setInstallmentMode] = useState<"total" | "parcela">("parcela");
  const [installmentPeriod, setInstallmentPeriod] = useState<string>("mensal");
  const [previewCount, setPreviewCount] = useState<number>(6);


  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [accountTarget, setAccountTarget] = useState<"origin" | "destination">("origin");

  const bodyRef = useRef<HTMLDivElement>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  // Scroll to top whenever dialog opens
  useEffect(() => {
    if (open) {
      setErrorField(null);
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0, behavior: "auto" }));
    }
  }, [open]);

  // Scroll to first error field
  useEffect(() => {
    if (!errorField || !bodyRef.current) return;
    const el = bodyRef.current.querySelector<HTMLElement>(`[data-field="${errorField}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el.querySelector<HTMLElement>("input,textarea,button,select,[role='combobox']");
      focusable?.focus({ preventScroll: true });
    }
    const t = setTimeout(() => setErrorField(null), 1500);
    return () => clearTimeout(t);
  }, [errorField]);

  // Unified auto-sync of dueDate whenever frequency/periodicity/date changes.
  // Recalcula sem depender do submit: cobre alternar entre semanal/quinzenal/mensal,
  // ativar/desativar Recorrente ou Parcelado e mudança do dia base.
  useEffect(() => {
    if (!date) return;
    const activePeriod =
      (isRecurring && recurrenceType) ||
      (isInstallment && installmentPeriod) ||
      null;
    if (!activePeriod) return;

    // Se não há dueDate ainda, inicializa com a data base para modos periódicos.
    if (!dueDate) {
      if (activePeriod === "semanal" || activePeriod === "mensal" || activePeriod === "quinzenal") {
        setDueDate(date);
      }
      return;
    }

    if (activePeriod === "semanal") {
      const targetWd = parseLocalDate(date).getDay();
      if (parseLocalDate(dueDate).getDay() !== targetWd) {
        setDueDate(shiftToWeekday(dueDate, targetWd));
      }
      return;
    }

    if (activePeriod === "mensal" || activePeriod === "quinzenal") {
      const targetDay = parseLocalDate(date).getDate();
      const dueParsed = parseLocalDate(dueDate);
      const clamped = Math.min(targetDay, lastDayOfMonth(dueParsed.getFullYear(), dueParsed.getMonth()));
      if (dueParsed.getDate() !== clamped) {
        setDueDate(shiftToMonthDay(dueDate, targetDay));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isRecurring, recurrenceType, isInstallment, installmentPeriod]);






  // Default account when opening for new transaction; also reset if current selection is no longer in scope
  useEffect(() => {
    if (!open || transaction) return;
    const isCard = accountId.startsWith("cc:")
      && creditCards.some((c) => `cc:${c.id}` === accountId);
    const isAccount = accountId && accounts.some((a) => a.id === accountId);
    if (!isCard && !isAccount) setAccountId(accounts[0]?.id ?? "");
  }, [open, transaction, accounts, creditCards, accountId]);

  // Populate form when editing
  useEffect(() => {
    if (transaction && open) {
      setType(transaction.transaction_type);
      setDescription(transaction.description);
      setAmount(transaction.amount.toFixed(2).replace(".", ","));
      setDate(transaction.transaction_date);
      setAccountId(transaction.credit_card_id ? `cc:${transaction.credit_card_id}` : (transaction.account_id ?? ""));
      setDestinationAccountId(transaction.destination_account_id ?? "");
      setCategoryId(transaction.category_id ?? "");
      setContactId(transaction.contact_id ?? "");
      setNotes(transaction.notes ?? "");
      setDueDate(transaction.due_date ?? "");
      setPaymentDate(transaction.payment_date ?? "");
      setPaymentMethodId(transaction.payment_method_id ?? "");
      setCostCenterId(transaction.cost_center_id ?? "");
      setStatus((transaction.status as any) ?? "confirmado");
      setIsRecurring(transaction.is_recurring ?? false);
      setRecurrenceType(transaction.recurrence_type ?? "mensal");
      setRecurrenceEndDate(transaction.recurrence_end_date ?? "");
      setAttachmentFiles([]);
      setRemovedAttachmentIds([]);
      // Load existing attachments from new table
      supabase
        .from("transaction_attachments")
        .select("id, file_name, file_url")
        .eq("transaction_id", transaction.id)
        .then(({ data }) => setExistingAttachments(data ?? []));
    } else if (!transaction && open) {
      resetForm();
      if (duplicateSource) {
        setType(duplicateSource.transaction_type);
        setDescription(duplicateSource.description);
        setAmount(duplicateSource.amount.toFixed(2).replace(".", ","));
        setDate(duplicateSource.transaction_date);
        setAccountId(duplicateSource.credit_card_id ? `cc:${duplicateSource.credit_card_id}` : (duplicateSource.account_id ?? ""));
        setDestinationAccountId(duplicateSource.destination_account_id ?? "");
        setCategoryId(duplicateSource.category_id ?? "");
        setContactId(duplicateSource.contact_id ?? "");
        setNotes(duplicateSource.notes ?? "");
        setDueDate(duplicateSource.due_date ?? "");
        setPaymentMethodId(duplicateSource.payment_method_id ?? "");
        setCostCenterId(duplicateSource.cost_center_id ?? "");
        // Duplicata sempre entra como pendente/nova (não copia pagamento nem recorrência)
        setStatus("pendente");
        setPaymentDate("");
        setIsRecurring(false);
      } else if (initialType) {
        setType(initialType);
      }
    }
  }, [transaction, open, duplicateSource]);

  const isEditing = !!transaction;

  const filteredCategories = categories.filter((c) => {
    if (type === "transferencia") return true;
    if (c.transaction_type !== type) return false;

    if (contextType === "pf") return (c as any).visible_pf !== false;
    if (contextType === "pj" && selectedCompanyId) {
      const companyIds = categoryCompanyIds.get(c.id) || [];
      return companyIds.includes(selectedCompanyId);
    }
    return true;
  });

  const totalAttachments = existingAttachments.filter(a => !removedAttachmentIds.includes(a.id)).length + attachmentFiles.length;

  const categoryTree = buildCategoryTree(filteredCategories);

  const filteredContacts = contacts.filter((c) => {
    if (contextType === "pf") return c.visible_pf;
    if (contextType === "pj" && selectedCompanyId) {
      const companyIds = contactCompanyIds.get(c.id) || [];
      return companyIds.includes(selectedCompanyId);
    }
    return true;
  });

  const filteredPaymentMethods = paymentMethods.filter((pm) => {
    if (contextType === "pf") return (pm as any).visible_pf !== false;
    if (contextType === "pj" && selectedCompanyId) {
      const companyIds = paymentMethodCompanyIds.get(pm.id) || [];
      return companyIds.includes(selectedCompanyId);
    }
    return true;
  });

  const filteredCostCenters = costCenters.filter((cc: any) => {
    if (contextType === "pf") return cc.visible_pf !== false;
    if (contextType === "pj" && selectedCompanyId) {
      const companyIds = costCenterCompanyIds.get(cc.id) || [];
      return companyIds.includes(selectedCompanyId);
    }
    return true;
  });

  // Reset cost center selection if no longer available in current profile scope
  useEffect(() => {
    if (!open || !costCenterId) return;
    const exists = filteredCostCenters.some((cc: any) => cc.id === costCenterId);
    if (!exists) setCostCenterId("");
  }, [open, filteredCostCenters, costCenterId]);

  // Reset payment method selection if no longer available in current profile scope
  useEffect(() => {
    if (!open || !paymentMethodId) return;
    const exists = filteredPaymentMethods.some((pm) => pm.id === paymentMethodId);
    if (!exists) setPaymentMethodId("");
  }, [open, filteredPaymentMethods, paymentMethodId]);

  // ---- Credit-card awareness ----
  // Uses synthetic "cc:<id>" values in accountId to represent credit cards.
  const selectedCardId = accountId.startsWith("cc:") ? accountId.slice(3) : null;
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const matchedCard = selectedCardId
    ? creditCards.find((c) => c.id === selectedCardId)
    : undefined;
  const isCreditCardAccount = !!matchedCard;
  const cardLabel = matchedCard
    ? [matchedCard.brand, matchedCard.last4 ? `•••• ${matchedCard.last4}` : null]
        .filter(Boolean).join(" ") || matchedCard.issuer || "Cartão"
    : null;

  const cycleFromCard = (() => {
    if (!matchedCard || !date) return null;
    try {
      const cycle = assignPurchaseToInvoice(parseLocalDate(date), {
        closingDay: matchedCard.closing_day,
        dueDay: matchedCard.due_day,
      });
      return {
        reference: cycle.referenceMonth,
        closing: cycle.closingDate,
        due: cycle.dueDate,
      };
    } catch {
      return null;
    }
  })();

  // Busca a fatura real (aberta) para o cartão + mês de referência do ciclo.
  // Quando existe, usamos o `due_date` autoritativo do banco (que pode ter
  // sido ajustado por feriados/reemissão), em vez de apenas recomputar.
  const referenceMonthYmd = cycleFromCard ? toYmd(cycleFromCard.reference) : null;
  const invoiceRowQuery = useQuery({
    queryKey: ["form-cc-invoice", selectedCardId, referenceMonthYmd],
    enabled: !!selectedCardId && !!referenceMonthYmd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_card_invoices")
        .select("id, due_date, closing_date, reference_month, status")
        .eq("credit_card_id", selectedCardId!)
        .eq("reference_month", referenceMonthYmd!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const invoicePreview = (() => {
    if (!cycleFromCard) return null;
    const row = invoiceRowQuery.data;
    if (row) {
      return {
        reference: parseLocalDate(row.reference_month),
        closing: parseLocalDate(row.closing_date),
        due: parseLocalDate(row.due_date),
      };
    }
    return cycleFromCard;
  })();

  // Auto-switch away from transferência when picking a credit card account
  useEffect(() => {
    if (isCreditCardAccount && type === "transferencia") {
      setType("saida");
      setCategoryId("");
    }
  }, [isCreditCardAccount, type]);

  // Compras no cartão nunca são "pagas" à vista — o pagamento vem da fatura.
  // Vencimento é derivado do ciclo/fatura atual e re-sincronizado sempre que
  // o cartão selecionado, o mês de referência ou o due_date da fatura mudam.
  useEffect(() => {
    if (!isCreditCardAccount) return;
    if (status !== "pendente") setStatus("pendente");
    if (paymentDate) setPaymentDate("");
    if (invoicePreview?.due) {
      const ymd = toYmd(invoicePreview.due);
      if (dueDate !== ymd) setDueDate(ymd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreditCardAccount, selectedCardId, referenceMonthYmd, invoicePreview?.due?.getTime()]);







  // --- Option builders with rich visuals matching each module ---
  const accountOptions: SearchableSelectOption[] = [
    ...accounts.map((acc) => {
      const isCard = acc.account_type === "cartao_credito";
      return {
        value: acc.id,
        label: acc.name,
        keywords: acc.account_type,
        leading: (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: (acc.color || "#1B3A5C") + "22" }}
          >
            {isCard ? (
              <CreditCard className="h-3 w-3" style={{ color: acc.color || "#1B3A5C" }} />
            ) : (
              <Wallet className="h-3 w-3" style={{ color: acc.color || "#1B3A5C" }} />
            )}
          </span>
        ),
        trailing: isCard ? (
          <Badge variant="secondary" className="shrink-0 border-0 text-[10px] h-4 px-1.5">Cartão</Badge>
        ) : undefined,
      } as SearchableSelectOption;
    }),
    ...creditCards.map((c) => {
      const label = [c.brand, c.last4 ? `•••• ${c.last4}` : null].filter(Boolean).join(" ")
        || c.issuer || "Cartão";
      return {
        value: `cc:${c.id}`,
        label,
        keywords: `cartao credito ${c.brand ?? ""} ${c.issuer ?? ""} ${c.last4 ?? ""}`,
        leading: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <CreditCard className="h-3 w-3 text-primary" />
          </span>
        ),
        trailing: (
          <Badge variant="secondary" className="shrink-0 border-0 text-[10px] h-4 px-1.5">Cartão</Badge>
        ),
      } as SearchableSelectOption;
    }),
  ];

  const flatCategoryOptions: SearchableSelectOption[] = (function () {
    const out: SearchableSelectOption[] = [];
    const walk = (list: CategoryNode[], parentIndex: string) => {
      list.forEach((n, i) => {
        const idx = parentIndex ? `${parentIndex}.${i + 1}` : `${i + 1}`;
        const g = n as unknown as CategoryGuidance;
        const hint = g.guidance_include || g.ai_description || null;
        const synthetic = n.children.length > 0 || (n as any).allow_transactions === false;
        out.push({
          value: n.id,
          label: n.name,
          depth: n.depth,
          selectable: !synthetic,
          keywords: `${idx} ${(g.keywords ?? []).join(" ")} ${g.guidance_include ?? ""} ${g.examples ?? ""}`,
          description: hint ? (
            <span className="line-clamp-2 text-[11px] text-muted-foreground">{hint}</span>
          ) : undefined,
          trailing: (n as any).requires_review ? (
            <Badge variant="secondary" className="shrink-0 border-0 text-[10px] h-4 px-1.5">
              Revisar
            </Badge>
          ) : synthetic ? (
            <Badge variant="outline" className="shrink-0 text-[10px] h-4 px-1.5">Grupo</Badge>
          ) : undefined,
          leading: (
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[11px] text-muted-foreground">{idx}.</span>
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: n.color || "hsl(var(--muted-foreground))" }}
              />
            </span>
          ),
        });
        if (n.children.length) walk(n.children, idx);
      });
    };
    walk(buildCategoryTree(filteredCategories), "");
    return out;
  })();

  const selectedCategory = (filteredCategories.find((c) => c.id === categoryId) ??
    null) as unknown as CategoryGuidance | null;


  // Auto-categorization suggestion (Fase 4)
  const { suggestion: categorySuggestion, applyHit: applyCategorizationHit } =
    useCategorizationSuggestion({
      description,
      transactionType:
        type === "entrada" ? "entrada" : type === "saida" ? "saida" : null,
      context: contextType,
      companyId: contextType === "pj" ? selectedCompanyId : null,
      enabled: open && type !== "transferencia" && !isEditing,
    });
  const suggestionCategoryLabel =
    categorySuggestion?.category_id
      ? flatCategoryOptions.find((o) => o.value === categorySuggestion.category_id)?.label ?? null
      : null;

  // Recomendação por texto/forma de pagamento/tipo (palavras-chave e exemplos)
  const selectedPaymentMethodName =
    filteredPaymentMethods.find((pm) => pm.id === paymentMethodId)?.name ?? null;
  const categoryRecommendations = useMemo(
    () =>
      type === "transferencia"
        ? []
        : recommendCategories(filteredCategories as unknown as RecommendCategoryInput[], {
            description,
            transactionType: type,
            paymentMethodName: selectedPaymentMethodName,
            limit: 3,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [description, type, selectedPaymentMethodName, filteredCategories.length, filteredCategories.map((c) => c.id).join(",")],
  );




  const CONTACT_BADGE_CLS: Record<string, string> = {
    cliente: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    fornecedor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    ambos: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  };
  const CONTACT_BADGE_LBL: Record<string, string> = {
    cliente: "Cliente",
    fornecedor: "Fornecedor",
    ambos: "Ambos",
  };

  const contactOptions: SearchableSelectOption[] = filteredContacts.map((ct) => ({
    value: ct.id,
    label: toProperName(ct.name),
    keywords: `${ct.name} ${ct.email ?? ""} ${ct.phone ?? ""} ${ct.document ?? ""}`,
    leading: (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {toProperName(ct.name).slice(0, 2).toUpperCase()}
      </span>
    ),
    trailing: (
      <Badge
        variant="secondary"
        className={`shrink-0 border-0 text-[10px] h-4 px-1.5 ${CONTACT_BADGE_CLS[ct.contact_type] ?? ""}`}
      >
        {CONTACT_BADGE_LBL[ct.contact_type] ?? ct.contact_type}
      </Badge>
    ),
  }));

  const paymentMethodOptions: SearchableSelectOption[] = filteredPaymentMethods.map((pm) => ({
    value: pm.id,
    label: pm.name,
    trailing: pm.visible_pf ? (
      <Badge variant="outline" className="shrink-0 text-[10px] h-4 px-1.5">Pessoal</Badge>
    ) : undefined,
  }));


  const costCenterOptions: SearchableSelectOption[] = [
    { value: "__none__", label: "Sem centro de custo" },
    ...filteredCostCenters.map((cc: any) => ({ value: cc.id, label: cc.name })),
  ];

  const resetForm = () => {
    setType("saida");
    setDescription("");
    setAmount("");
    setDate(toYmd(new Date()));
    setDueDate("");
    setPaymentDate("");
    setAccountId(accounts[0]?.id ?? "");
    setDestinationAccountId("");
    setCategoryId("");
    setContactId("");
    setNotes("");
    setPaymentMethodId("");
    setCostCenterId("");
    setStatus("confirmado");
    setIsRecurring(false);
    setRecurrenceType("mensal");
    setRecurrenceEndDate("");
    setIsInstallment(false);
    setInstallmentTotal(2);
    setInstallmentMode("parcela");
    setInstallmentPeriod("mensal");
    setAttachmentFiles([]);
    setExistingAttachments([]);
    setRemovedAttachmentIds([]);
  };

  const uploadAttachments = async (transactionId: string) => {
    if (!user) return;
    // Remove deleted attachments
    if (removedAttachmentIds.length > 0) {
      await supabase.from("transaction_attachments").delete().in("id", removedAttachmentIds);
    }
    // Upload new files
    for (const file of attachmentFiles) {
      const ext = file.name.split(".").pop();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const filePath = `${user.id}/${transactionId}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage
        .from("transaction-attachments")
        .upload(filePath, file, { upsert: false });
      if (error) {
        toast.error(`Erro ao enviar ${file.name}`, { description: error.message });
        continue;
      }
      await supabase.from("transaction_attachments").insert({
        transaction_id: transactionId,
        user_id: user.id,
        file_name: file.name,
        file_url: filePath,
        file_size: file.size,
        file_type: file.type || ext || null,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numAmount = parseCurrencyToNumber(amount);
    const effectiveAccountId = selectedCardId ? "" : accountId;
    const effectiveCardId = selectedCardId;
    const parseResult = transactionSchema.safeParse({
      description, amount: numAmount, transaction_type: type,
      transaction_date: date, account_id: effectiveAccountId || effectiveCardId || "",
      destination_account_id: type === "transferencia" ? destinationAccountId || "" : null,
      category_id: categoryId || null, notes: notes || null,
      payment_method_id: paymentMethodId || null,
      due_date: dueDate || null,
    });
    if (!parseResult.success) {
      const firstErr = parseResult.error.errors[0];
      toast.error(firstErr?.message ?? "Dados inválidos");
      const path = String(firstErr?.path[0] ?? "");
      const fieldMap: Record<string, string> = {
        description: "description", amount: "amount",
        transaction_date: "transaction_date", account_id: "account_id",
        destination_account_id: "destination_account_id",
        category_id: "category", notes: "notes",
        payment_method_id: "payment_method", due_date: "due_date",
      };
      setErrorField(fieldMap[path] ?? null);
      return;
    }
    if (type === "transferencia" && !destinationAccountId) {
      setErrorField("destination_account_id");
      return toast.error("Selecione a conta de destino");
    }

    // Custom required-field validation based on user settings
    const requiredErrors: TransactionField[] = [];
    if (type !== "transferencia") {
      if (isRequired("category") && !categoryId) requiredErrors.push("category");
      if (isRequired("contact") && !contactId) requiredErrors.push("contact");
      if (isRequired("due_date") && !dueDate) requiredErrors.push("due_date");
      if (isRequired("payment_date") && status === "confirmado" && !paymentDate) requiredErrors.push("payment_date");
    }
    if (isRequired("payment_method") && !paymentMethodId) requiredErrors.push("payment_method");
    if (isRequired("notes") && !notes.trim()) requiredErrors.push("notes");
    if (isRequired("attachments")) {
      const remaining = existingAttachments.filter((a) => !removedAttachmentIds.includes(a.id)).length + attachmentFiles.length;
      if (remaining === 0) requiredErrors.push("attachments");
    }
    if (requiredErrors.length > 0) {
      const first = requiredErrors[0];
      toast.error(`${TRANSACTION_FIELD_LABELS[first]} é obrigatório`);
      setErrorField(first);
      return;
    }

    setSaving(true);

    // ---- Parcelado (modificador de receita/despesa): gera parent + N filhas ----
    if (!isEditing && isInstallment && (type === "entrada" || type === "saida")) {
      try {
        if (installmentTotal < 2) {
          toast.error("Nº de parcelas deve ser ≥ 2");
          setSaving(false);
          return;
        }
        const totalAmount = installmentMode === "total" ? numAmount : numAmount * installmentTotal;
        const baseParcel = installmentMode === "total"
          ? Math.floor((numAmount / installmentTotal) * 100) / 100
          : numAmount;
        const remainder = Math.round((totalAmount - baseParcel * installmentTotal) * 100) / 100;

        // Datas de cada parcela
        const dates: string[] = [];
        let cursor = parseLocalDate(date);
        for (let i = 0; i < installmentTotal; i++) {
          dates.push(toYmd(cursor));
          cursor = getNextRecurrenceDate(cursor, installmentPeriod);
        }


        const commonFields = {
          user_id: user.id,
          transaction_type: type,
          installment_total: installmentTotal,
          description: description.trim(),
          category_id: categoryId || null,
          contact_id: contactId || null,
          notes: notes.trim() || null,
          payment_method_id: paymentMethodId || null,
          cost_center_id: costCenterId || null,
          account_id: effectiveAccountId || null,
          credit_card_id: effectiveCardId || null,
          context: contextType,
          company_id: contextType === "pj" ? selectedCompanyId : null,
        };

        // 1) Parent âncora (installment_number NULL, status cancelado — não afeta saldo)
        const { data: parent, error: parentErr } = await supabase
          .from("transactions")
          .insert({
            ...commonFields,
            amount: totalAmount,
            transaction_date: dates[0],
            due_date: null,
            status: "cancelado",
            amount_paid: 0,
            payment_date: null,
            bill_status: null,
          } as any)
          .select("id")
          .single();
        if (parentErr || !parent) throw parentErr ?? new Error("Falha ao criar parcelamento");

        // 2) N parcelas filhas
        const children = dates.map((d, i) => {
          const isLast = i === installmentTotal - 1;
          const parcelAmount = isLast ? Math.round((baseParcel + remainder) * 100) / 100 : baseParcel;
          return {
            ...commonFields,
            amount: parcelAmount,
            transaction_date: d,
            due_date: d,
            installment_number: i + 1,
            parent_transaction_id: parent.id,
            status: "pendente",
            amount_paid: 0,
            payment_date: null,
            bill_status: "em_dia",
          };
        });
        const { error: cErr } = await supabase.from("transactions").insert(children as any);
        if (cErr) throw cErr;

        await supabase.rpc("insert_audit_log", {
          _action: "transaction_created",
          _entity_type: "transaction",
          _entity_id: parent.id,
          _details: { target_name: description.trim(), amount: String(totalAmount), type, installments: installmentTotal },
        });

        toast.success(`Parcelamento criado: ${installmentTotal}× de ${baseParcel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
        resetForm();
        onOpenChange(false);
        onCreated();
      } catch (err: any) {
        toast.error("Erro ao criar parcelamento", { description: err?.message });
      } finally {
        setSaving(false);
      }
      return;
    }

    const hasDueDate = !!dueDate && type !== "transferencia";

    const payload: any = {
      transaction_type: type,
      description: description.trim(),
      amount: numAmount,
      transaction_date: date,
      account_id: effectiveAccountId || null,
      credit_card_id: effectiveCardId || null,
      destination_account_id: type === "transferencia" ? destinationAccountId : null,
      category_id: categoryId || null,
      contact_id: type !== "transferencia" ? (contactId || null) : null,
      notes: notes.trim() || null,
      payment_method_id: paymentMethodId || null,
      cost_center_id: costCenterId || null,
      context: contextType,
      company_id: contextType === "pj" ? selectedCompanyId : null,
      due_date: hasDueDate ? dueDate : null,
      status: status,
      is_recurring: isRecurring,
      recurrence_type: isRecurring ? recurrenceType : null,
      recurrence_end_date: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
    };

    // Handle payment fields based on status
    if (status === "confirmado") {
      payload.amount_paid = numAmount;
      payload.payment_date = paymentDate || date;
      payload.bill_status = hasDueDate ? "pago" : null;
    } else if (status === "pendente") {
      payload.amount_paid = 0;
      payload.payment_date = null;
      payload.bill_status = hasDueDate ? "em_dia" : null;
    } else if (status === "cancelado") {
      payload.amount_paid = 0;
      payload.payment_date = null;
      payload.bill_status = null;
    }

    if (isEditing) {
      await uploadAttachments(transaction.id);

      // Payment/status fields are per-occurrence and must never propagate to siblings/parent
      const PAYMENT_KEYS = new Set(["status", "amount_paid", "payment_date", "bill_status"]);
      // Date fields belong to a single occurrence
      const DATE_KEYS = new Set(["transaction_date", "due_date"]);
      // Recurrence config lives only on the series parent
      const RECURRENCE_KEYS = new Set(["is_recurring", "recurrence_type", "recurrence_end_date"]);

      const propagatePayload: any = Object.fromEntries(
        Object.entries(payload).filter(
          ([k]) => !PAYMENT_KEYS.has(k) && !DATE_KEYS.has(k) && !RECURRENCE_KEYS.has(k),
        ),
      );

      const seriesParentId = transaction.parent_transaction_id ?? transaction.id;
      let affected = 1;
      let error: any = null;

      if (editScope === "all") {
        // 1. Apply full payload (incl. payment state) ONLY to the clicked occurrence
        const { error: sErr } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", transaction.id);
        if (sErr) error = sErr;

        // 2. Update the series parent (if different from clicked) with shared fields + recurrence config
        if (!error && seriesParentId !== transaction.id) {
          const parentPayload = {
            ...propagatePayload,
            is_recurring: payload.is_recurring,
            recurrence_type: payload.recurrence_type,
            recurrence_end_date: payload.recurrence_end_date,
          };
          const { error: pErr } = await supabase
            .from("transactions")
            .update(parentPayload)
            .eq("id", seriesParentId);
          if (pErr) error = pErr;
          else affected += 1;
        }

        // 3. Propagate shared fields to every other child (skip the clicked one)
        if (!error) {
          const { error: cErr, count } = await supabase
            .from("transactions")
            .update(propagatePayload, { count: "exact" })
            .eq("parent_transaction_id", seriesParentId)
            .neq("id", transaction.id);
          if (cErr) error = cErr;
          else affected += count ?? 0;
        }
      } else if (editScope === "forward") {
        // Apply full payload (incl. payment state) ONLY to the clicked occurrence
        const { error: sErr } = await supabase
          .from("transactions")
          .update(payload)
          .eq("id", transaction.id);
        if (sErr) error = sErr;
        // Propagate shared fields (no payment, no dates, no recurrence config) to future siblings
        if (!error) {
          const { error: fErr, count } = await supabase
            .from("transactions")
            .update(propagatePayload, { count: "exact" })
            .eq("parent_transaction_id", seriesParentId)
            .gt("transaction_date", transaction.transaction_date);
          if (fErr) error = fErr;
          else affected = 1 + (count ?? 0);
        }
      } else {
        const { error: sErr } = await supabase.from("transactions").update(payload).eq("id", transaction.id);
        if (sErr) error = sErr;
      }

      if (error) {
        toast.error("Erro ao salvar", { description: error.message });
      } else {
        await supabase.rpc("insert_audit_log", {
          _action: "transaction_updated",
          _entity_type: "transaction",
          _entity_id: transaction.id,
          _details: { target_name: description.trim(), amount: String(numAmount), type, edit_scope: editScope, affected },
        });
        toast.success(
          affected > 1
            ? `Lançamento atualizado (${affected} afetados)`
            : "Lançamento atualizado!",
        );
        resetForm();
        onOpenChange(false);
        onCreated();
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert({ ...payload, user_id: user.id })
        .select("id")
        .single();

      if (error || !inserted) {
        toast.error("Erro ao salvar", { description: error?.message });
      } else {
        // Upload attachments to new table
        await uploadAttachments(inserted.id);
        // Generate future recurring transactions
        if (isRecurring) {
          const futureDates = generateRecurrenceDates(date, recurrenceType, recurrenceEndDate || undefined);
          if (futureDates.length > 0) {
            const futurePayloads = futureDates.map((futureDate) => {
              const futureDueDate = hasDueDate && dueDate
                ? (() => {
                    // Parse YYYY-MM-DD como data local (evita drift de fuso
                    // que jogaria o vencimento para o mês anterior/seguinte).
                    const MS_DAY = 86_400_000;
                    const baseDue = parseLocalDate(dueDate).getTime();
                    const baseTx = parseLocalDate(date).getTime();
                    const fdBase = parseLocalDate(futureDate).getTime();
                    const diffDays = Math.round((baseDue - baseTx) / MS_DAY);
                    const fd = new Date(fdBase + diffDays * MS_DAY);
                    return toYmd(fd);
                  })()
                : null;

              return {
                ...payload,
                user_id: user.id,
                transaction_date: futureDate,
                due_date: futureDueDate,
                parent_transaction_id: inserted.id,
                is_recurring: false, // children are not recurring themselves
                // Future occurrences always start as pending — they haven't happened yet
                status: "pendente",
                amount_paid: 0,
                payment_date: null,
                bill_status: futureDueDate ? "em_dia" : null,
              };
            });
            const { error: recError } = await supabase.from("transactions").insert(futurePayloads);
            if (recError) {
              toast.error("Erro ao gerar recorrências", { description: recError.message });
            } else {
              toast.success(`Lançamento criado com ${futureDates.length} recorrência(s)!`);
            }
          } else {
            toast.success("Lançamento criado!");
          }
        } else {
          toast.success("Lançamento criado!");
        }

        await supabase.rpc("insert_audit_log", {
          _action: "transaction_created",
          _entity_type: "transaction",
          _entity_id: inserted.id,
          _details: { target_name: description.trim(), amount: String(numAmount), type, recurring: isRecurring },
        });
        resetForm();
        onOpenChange(false);
        onCreated();
      }
    }
    setSaving(false);
  };

  const fieldSuffix = (field: TransactionField) =>
    isRequired(field) ? (
      <span className="text-destructive ml-0.5">*</span>
    ) : (
      <span className="text-muted-foreground font-normal"> (opcional)</span>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[calc(var(--vvh,100dvh)-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[90vh] [padding-top:0] [padding-bottom:0] [padding-left:0] [padding-right:0]">
        <DialogHeader className="px-4 sm:px-6 pb-3 border-b shrink-0 [padding-top:max(1rem,env(safe-area-inset-top))] sm:[padding-top:1.5rem]">
          <DialogTitle>{isEditing ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4 [-webkit-overflow-scrolling:touch]">
          {/* Type tabs */}
          <Tabs value={type} onValueChange={(v) => { setType(v as TransactionType); setCategoryId(""); }}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="entrada" className="data-[state=active]:bg-success data-[state=active]:text-success-foreground">
                Receita
              </TabsTrigger>
              <TabsTrigger value="saida" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
                Despesa
              </TabsTrigger>
              <TabsTrigger value="transferencia" disabled={isCreditCardAccount}>
                Transferência
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Amount */}
          <div className="space-y-2" data-field="amount">
            <Label>
              {isInstallment && type !== "transferencia"
                ? (installmentMode === "total" ? "Valor total" : "Valor da parcela")
                : "Valor"}
            </Label>
            <AmountField value={amount} onValueChange={setAmount} placeholder="0,00" />
          </div>


          {/* Description */}
          <div className="space-y-2" data-field="description">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado, Salário..."
              maxLength={200}
            />
            {categorySuggestion && !categoryId && type !== "transferencia" && suggestionCategoryLabel && (
              <button
                type="button"
                onClick={async () => {
                  setCategoryId(categorySuggestion.category_id!);
                  await applyCategorizationHit(categorySuggestion.rule_id);
                }}
                className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                title={`Regra: ${categorySuggestion.pattern}`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  Sugestão: <strong>{suggestionCategoryLabel}</strong>
                  <span className="ml-1 text-muted-foreground">
                    ({Math.round(categorySuggestion.confidence * 100)}% ·{" "}
                    {categorySuggestion.layer === "deterministic" ? "regra" : "similaridade"})
                  </span>
                </span>
                <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5">Aplicar</span>
              </button>
            )}
            {type !== "transferencia" && categoryRecommendations.length > 0 && (
              <CategoryRecommendationHint
                recommendations={categoryRecommendations}
                selectedCategoryId={categoryId}
                onApply={(id) => setCategoryId(id)}
              />
            )}
          </div>



          {/* Data atribuída automaticamente (data de criação) — campo oculto */}


          {/* Due date - only for receita/despesa (não para cartão de crédito) */}
          {type !== "transferencia" && !isCreditCardAccount && (
            <div className="space-y-2" data-field="due_date">
              <Label>Data de vencimento{fieldSuffix("due_date")}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="pl-10"
                  placeholder="Sem vencimento"
                />
              </div>
              {/* Weekday helper — visible when editing a weekly recurring/installment child */}
              {isEditing && dueDate && (transaction?.parent_transaction_id || (transaction?.installment_total ?? 0) > 0) && (
                <div className="pt-1">
                  <Label className="text-xs text-muted-foreground">Dia da semana do vencimento</Label>
                  <Select
                    value={String(currentWeekday(dueDate))}
                    onValueChange={(v) => setDueDate(shiftToWeekday(dueDate, Number(v)))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((w) => (
                        <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Month-day helper — visible when editing a monthly/biweekly recurring/installment child */}
              {isEditing && dueDate && (transaction?.parent_transaction_id || (transaction?.installment_total ?? 0) > 0) && (
                <div className="pt-1">
                  <Label className="text-xs text-muted-foreground">Dia do mês do vencimento</Label>
                  <Select
                    value={String(currentMonthDay(dueDate))}
                    onValueChange={(v) => setDueDate(shiftToMonthDay(dueDate, Number(v)))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {MONTH_DAYS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Dias 29–31 são ajustados para o último dia do mês quando necessário.</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Se preenchido, o lançamento será tratado como compromisso pendente.
              </p>
            </div>
          )}

          {/* Payment date - only for receita/despesa with confirmed status (não para cartão) */}
          {type !== "transferencia" && !isCreditCardAccount && status === "confirmado" && (
            <div className="space-y-2" data-field="payment_date">
              <Label>Data de pagamento{fieldSuffix("payment_date")}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="pl-10"
                  placeholder="Data do efetivo pagamento"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se vazio, será considerada a data do lançamento.
              </p>
            </div>
          )}

          {/* Recurrence — hidden for transferencia and when Parcelado is active (mutex) */}
          {type !== "transferencia" && !isInstallment && !isEditing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="recurring-switch" className="cursor-pointer">Lançamento recorrente</Label>
                </div>
                <Switch
                  id="recurring-switch"
                  checked={isRecurring}
                  onCheckedChange={setIsRecurring}
                />
              </div>

              {isRecurring && (
                <div className="space-y-3 pl-6 border-l-2 border-muted">
                  <div className="space-y-2">
                    <Label>Frequência</Label>
                    <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diario">Diário</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="bimestral">Bimestral</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                        <SelectItem value="semestral">Semestral</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {recurrenceType === "semanal" && (
                    <div className="space-y-2">
                      <Label>Dia da semana</Label>
                      <Select
                        value={date ? String(parseLocalDate(date).getDay()) : "1"}
                        onValueChange={(v) => {
                          const w = Number(v);
                          setDate(shiftToWeekday(date, w));
                          if (dueDate) setDueDate(shiftToWeekday(dueDate, w));
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((w) => (
                            <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(recurrenceType === "mensal" || recurrenceType === "quinzenal") && (
                    <div className="space-y-2">
                      <Label>Dia do mês do vencimento</Label>
                      <Select
                        value={date ? String(parseLocalDate(date).getDate()) : "1"}
                        onValueChange={(v) => {
                          const d = Number(v);
                          setDate(shiftToMonthDay(date, d));
                          if (dueDate) setDueDate(shiftToMonthDay(dueDate, d));
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {MONTH_DAYS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {recurrenceType === "quinzenal"
                          ? "A 1ª ocorrência cai neste dia; a 2ª cai 15 dias depois. Dias 29–31 são ajustados para o último dia do mês."
                          : "Todas as ocorrências caem neste dia. Dias 29–31 são ajustados para o último dia do mês."}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Data final da recorrência (opcional)</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  {(() => {
                    const preview = buildOccurrencePreview(date, dueDate, recurrenceType, previewCount, recurrenceEndDate || undefined);
                    if (preview.length === 0) return null;
                    return (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">Próximas ocorrências (preview)</p>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-[10px] text-muted-foreground">Mostrar</Label>
                            <Select value={String(previewCount)} onValueChange={(v) => setPreviewCount(Number(v))}>
                              <SelectTrigger className="h-6 w-16 text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[3, 6, 12, 24].map((n) => (
                                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <ul className="text-[11px] text-muted-foreground space-y-0.5">
                          {preview.map((p, idx) => (
                            <li key={idx} className="flex justify-between gap-3">
                              <span>{idx + 1}. Lançamento: <strong className="text-foreground">{formatBR(p.date)}</strong></span>
                              {p.due && <span>Venc.: <strong className="text-foreground">{formatBR(p.due)}</strong></span>}
                            </li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-muted-foreground">Confirme o dia antes de salvar. Dias 29–31 caem no último dia do mês curto.</p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Parcelado — modificador de receita/despesa (mutex com Recorrente) */}
          {type !== "transferencia" && !isRecurring && !isEditing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="installment-switch" className="cursor-pointer">Lançamento parcelado</Label>
                </div>
                <Switch
                  id="installment-switch"
                  checked={isInstallment}
                  onCheckedChange={setIsInstallment}
                />
              </div>

              {isInstallment && (
                <div className="space-y-3 pl-6 border-l-2 border-muted">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nº de parcelas</Label>
                      <Input
                        type="number"
                        min={2}
                        max={360}
                        value={installmentTotal}
                        onChange={(e) => setInstallmentTotal(Math.max(2, Math.min(360, Number(e.target.value) || 2)))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Periodicidade</Label>
                      <Select value={installmentPeriod} onValueChange={setInstallmentPeriod}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="diario">Diário</SelectItem>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="quinzenal">Quinzenal</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="bimestral">Bimestral</SelectItem>
                          <SelectItem value="trimestral">Trimestral</SelectItem>
                          <SelectItem value="semestral">Semestral</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {installmentPeriod === "semanal" && (
                    <div className="space-y-2">
                      <Label>Dia da semana</Label>
                      <Select
                        value={date ? String(parseLocalDate(date).getDay()) : "1"}
                        onValueChange={(v) => {
                          const w = Number(v);
                          setDate(shiftToWeekday(date, w));
                          if (dueDate) setDueDate(shiftToWeekday(dueDate, w));
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((w) => (
                            <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">A data de vencimento é ajustada para o próximo {WEEKDAYS.find(w => w.value === String(parseLocalDate(date).getDay()))?.label.toLowerCase()}.</p>
                    </div>
                  )}
                  {(installmentPeriod === "mensal" || installmentPeriod === "quinzenal") && (
                    <div className="space-y-2">
                      <Label>Dia do mês do vencimento</Label>
                      <Select
                        value={date ? String(parseLocalDate(date).getDate()) : "1"}
                        onValueChange={(v) => {
                          const d = Number(v);
                          setDate(shiftToMonthDay(date, d));
                          if (dueDate) setDueDate(shiftToMonthDay(dueDate, d));
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {MONTH_DAYS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {installmentPeriod === "quinzenal"
                          ? "A 1ª parcela cai neste dia; a 2ª cai 15 dias depois, e assim por diante. Dias 29–31 são ajustados para o último dia do mês."
                          : "Todas as parcelas caem neste dia do mês. Dias 29–31 são ajustados para o último dia do mês."}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Valor informado é</Label>
                    <Select value={installmentMode} onValueChange={(v) => setInstallmentMode(v as "total" | "parcela")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parcela">Por parcela</SelectItem>
                        <SelectItem value="total">Total (será dividido)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(() => {
                    const val = parseCurrencyToNumber(amount) || 0;
                    if (val <= 0) return null;
                    const per = installmentMode === "total"
                      ? Math.floor((val / installmentTotal) * 100) / 100
                      : val;
                    const grand = installmentMode === "total" ? val : val * installmentTotal;
                    return (
                      <p className="text-[11px] text-muted-foreground">
                        {installmentTotal}× de {per.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        {" — total "}
                        {grand.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                    );
                  })()}
                  {(() => {
                    const total = installmentTotal || 0;
                    const count = Math.min(previewCount, Math.max(2, total));
                    const preview = buildOccurrencePreview(date, dueDate, installmentPeriod, count);
                    if (preview.length === 0) return null;
                    return (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">
                            Preview das parcelas {total > count ? `(1–${count} de ${total})` : `(${total})`}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-[10px] text-muted-foreground">Mostrar</Label>
                            <Select value={String(previewCount)} onValueChange={(v) => setPreviewCount(Number(v))}>
                              <SelectTrigger className="h-6 w-16 text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[3, 6, 12, 24].map((n) => (
                                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <ul className="text-[11px] text-muted-foreground space-y-0.5">
                          {preview.map((p, idx) => (
                            <li key={idx} className="flex justify-between gap-3">
                              <span>{idx + 1}/{total}. Lançamento: <strong className="text-foreground">{formatBR(p.date)}</strong></span>
                              {p.due && <span>Venc.: <strong className="text-foreground">{formatBR(p.due)}</strong></span>}
                            </li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-muted-foreground">Confirme o dia antes de salvar. Dias 29–31 caem no último dia do mês curto.</p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Account */}
          <div className="space-y-2" data-field="account_id">
            <Label>{type === "transferencia" ? "Conta de origem" : "Conta"}</Label>
            <div className="flex gap-2">
              <SearchableSelect
                value={accountId}
                onValueChange={setAccountId}
                options={accountOptions}
                placeholder="Selecione a conta"
                searchPlaceholder="Buscar conta..."
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Criar nova conta"
                onClick={() => { setAccountTarget("origin"); setAccountDialogOpen(true); }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Credit card invoice preview */}
          {isCreditCardAccount && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4 text-primary" />
                <span>Compra no cartão{cardLabel ? ` — ${cardLabel}` : ""}</span>
              </div>
              {invoicePreview ? (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>
                    Será alocada na fatura de{" "}
                    <strong className="text-foreground">
                      {invoicePreview.reference.toLocaleString("pt-BR", { month: "long", year: "numeric" })}
                    </strong>
                  </p>
                  <p>
                    Fechamento: <strong className="text-foreground">{formatBR(toYmd(invoicePreview.closing))}</strong>
                    {" · "}Vencimento: <strong className="text-foreground">{formatBR(toYmd(invoicePreview.due))}</strong>
                  </p>
                  {isInstallment && installmentTotal > 1 && (
                    <p className="pt-1">Cada parcela cairá na fatura do respectivo mês.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Cartão sem ciclo configurado — cadastre em Cartões de Crédito para calcular a fatura.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                O status fica <strong>pendente</strong> e a baixa acontece ao pagar a fatura.
              </p>
            </div>
          )}

          {/* Destination account (transfer) */}
          {type === "transferencia" && (
            <div className="space-y-2" data-field="destination_account_id">
              <Label>Conta de destino</Label>
              <div className="flex gap-2">
                <SearchableSelect
                  value={destinationAccountId}
                  onValueChange={setDestinationAccountId}
                  options={accountOptions.filter((o) => o.value !== accountId)}
                  placeholder="Selecione o destino"
                  searchPlaceholder="Buscar conta..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Criar nova conta"
                  onClick={() => { setAccountTarget("destination"); setAccountDialogOpen(true); }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Category - hierarchical display */}
          {type !== "transferencia" && (
            <div className="space-y-2" data-field="category">
              <div className="flex items-center gap-1.5">
                <Label>Categoria{fieldSuffix("category")}</Label>
                {selectedCategory && <CategoryGuidanceTooltip cat={selectedCategory} />}
              </div>
              <div className="flex gap-2">
                <SearchableSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={flatCategoryOptions}
                  placeholder="Selecione a categoria"
                  searchPlaceholder="Buscar por nome, exemplo ou palavra-chave..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Criar nova categoria"
                  onClick={() => setCategoryDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedCategory && <CategoryGuidancePanel cat={selectedCategory} />}
            </div>

          )}

          {/* Contact (Cliente/Fornecedor) */}
          {type !== "transferencia" && (
            <div className="space-y-2" data-field="contact">
              <Label>Cliente/Fornecedor{fieldSuffix("contact")}</Label>
              <div className="flex gap-2">
                <SearchableSelect
                  value={contactId}
                  onValueChange={setContactId}
                  options={contactOptions}
                  placeholder="Selecione o contato"
                  searchPlaceholder="Buscar cliente/fornecedor..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Criar novo cliente/fornecedor"
                  onClick={() => setContactDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2" data-field="payment_method">
            <Label>Forma de pagamento{fieldSuffix("payment_method")}</Label>
            <div className="flex gap-2">
              <SearchableSelect
                value={paymentMethodId}
                onValueChange={setPaymentMethodId}
                options={paymentMethodOptions}
                placeholder="Selecione"
                searchPlaceholder="Buscar forma de pagamento..."
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Criar nova forma de pagamento"
                onClick={() => setPaymentMethodDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Centro de Custo (opcional) */}
          <div className="space-y-2" data-field="cost_center">
            <Label>Centro de custo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <SearchableSelect
              value={costCenterId}
              onValueChange={(v) => setCostCenterId(v === "__none__" ? "" : v)}
              options={costCenterOptions}
              placeholder="Selecione o centro de custo"
              searchPlaceholder="Buscar centro de custo..."
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "confirmado" | "pendente" | "cancelado")}
              disabled={isCreditCardAccount}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmado">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                    Pago
                  </span>
                </SelectItem>
                <SelectItem value="pendente">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    Pendente
                  </span>
                </SelectItem>
                <SelectItem value="cancelado">
                  <span className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                    Cancelado
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {isCreditCardAccount && (
              <p className="text-[11px] text-muted-foreground">
                Compras no cartão ficam pendentes até o pagamento da fatura.
              </p>
            )}
            {status === "cancelado" && (
              <p className="text-[11px] text-destructive">
                O valor pago será zerado e não será considerado nos saldos.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2" data-field="notes">
            <Label>Observações{fieldSuffix("notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações adicionais..."
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2" data-field="attachments">
            <Label>Anexos{fieldSuffix("attachments")} — {totalAttachments}/5</Label>
            {/* Existing attachments */}
            {existingAttachments.filter(a => !removedAttachmentIds.includes(a.id)).map((att) => (
              <div key={att.id} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{att.file_name}</span>
                <button
                  type="button"
                  onClick={async () => {
                    const url = await getSignedAttachmentUrl(att.file_url);
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Ver
                </button>
                <button type="button" onClick={() => setRemovedAttachmentIds(prev => [...prev, att.id])} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {/* New files queued */}
            {attachmentFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                <button type="button" onClick={() => setAttachmentFiles(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {/* Drop zone - only show if under limit */}
            {totalAttachments < MAX_ATTACHMENTS ? (
              <label
                className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 hover:border-primary/50 transition-colors data-[dragging=true]:bg-primary/10 data-[dragging=true]:border-primary"
                data-dragging={undefined}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.dataset.dragging = "true"; }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.dataset.dragging = "true"; }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.dataset.dragging = "false"; }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  e.currentTarget.dataset.dragging = "false";
                  const files = Array.from(e.dataTransfer.files);
                  const remaining = MAX_ATTACHMENTS - totalAttachments;
                  if (files.length > remaining) toast.error(`Máximo ${MAX_ATTACHMENTS} anexos por lançamento`);
                  const valid = files.slice(0, remaining).filter(f => {
                    if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: máximo 10MB`); return false; }
                    return true;
                  });
                  if (valid.length) setAttachmentFiles(prev => [...prev, ...valid]);
                }}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground text-center">Arraste arquivos aqui ou clique para selecionar</span>
                <span className="text-xs text-muted-foreground/70">Imagens, PDF, DOC, XLS, TXT — máx. 10MB cada, até {MAX_ATTACHMENTS} arquivos</span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    const remaining = MAX_ATTACHMENTS - totalAttachments;
                    if (files.length > remaining) toast.error(`Máximo ${MAX_ATTACHMENTS} anexos por lançamento`);
                    const valid = files.slice(0, remaining).filter(f => {
                      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: máximo 10MB`); return false; }
                      return true;
                    });
                    if (valid.length) setAttachmentFiles(prev => [...prev, ...valid]);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">Limite de {MAX_ATTACHMENTS} anexos atingido</p>
            )}
          </div>
          </div>

          <div className="px-4 sm:px-6 pt-3 border-t shrink-0 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] sm:[padding-bottom:1.5rem]">
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvando..." : isEditing ? "Atualizar Lançamento" : "Salvar Lançamento"}
            </Button>
          </div>
        </form>
      </DialogContent>


      <AccountFormDialog
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
        onSaved={(newId) => {
          invalidateLookups();
          if (newId) {
            if (accountTarget === "destination") setDestinationAccountId(newId);
            else setAccountId(newId);
          }
        }}
      />

      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        defaultType={type === "entrada" ? "entrada" : "saida"}
        onSaved={(newId) => {
          invalidateLookups();
          if (newId) setCategoryId(newId);
        }}
      />

      <ContactFormDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onSaved={(newId) => {
          invalidateLookups();
          if (newId) setContactId(newId);
        }}
      />

      <PaymentMethodFormDialog
        open={paymentMethodDialogOpen}
        onOpenChange={setPaymentMethodDialogOpen}
        onSaved={(newId) => {
          invalidateLookups();
          if (newId) setPaymentMethodId(newId);
        }}
      />
    </Dialog>
  );
}
