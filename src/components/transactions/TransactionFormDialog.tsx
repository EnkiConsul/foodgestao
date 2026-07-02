import { useState, useEffect, useMemo, useRef } from "react";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { transactionSchema, validateWithToast } from "@/lib/validations";
import { getSignedAttachmentUrl } from "@/lib/attachments";
import { Calendar, Repeat, Paperclip, X, FileText, Upload, CheckCircle, Clock, XCircle, Plus, Wallet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/integrations/supabase/types";
import { AccountFormDialog } from "@/components/accounts/AccountFormDialog";
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { PaymentMethodFormDialog } from "@/components/payment-methods/PaymentMethodFormDialog";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useTransactionFieldSettings, TRANSACTION_FIELD_LABELS, type TransactionField } from "@/hooks/useTransactionFieldSettings";

type TransactionType = "receita" | "despesa" | "transferencia";

interface EditableTransaction {
  id: string;
  description: string;
  amount: number;
  transaction_type: TransactionType;
  transaction_date: string;
  account_id: string;
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
  parent_transaction_id?: string | null;
}

export type EditScope = "single" | "forward" | "all";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  transaction?: EditableTransaction | null;
  initialType?: TransactionType;
  editScope?: EditScope;
}

type CategoryNode = Tables<"categories"> & { children: CategoryNode[]; depth: number };

function buildCategoryTree(cats: Tables<"categories">[]): CategoryNode[] {
  // Preserve the order from the query (transaction_type, sort_order, name)
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  cats.forEach((c) => map.set(c.id, { ...c, children: [], depth: 0 }));
  cats.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      const parent = map.get(c.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function renderCategoryNodes(nodes: CategoryNode[]): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      result.push(
        <SelectGroup key={`group-${node.id}`}>
          <SelectLabel className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            {node.name}
          </SelectLabel>
          <SelectItem value={node.id} className="pl-6 text-sm">
            {node.name}
          </SelectItem>
          {renderCategoryNodes(node.children)}
        </SelectGroup>
      );
    } else {
      const paddingClass = node.depth === 0 ? "" : node.depth === 1 ? "pl-6" : "pl-10";
      result.push(
        <SelectItem key={node.id} value={node.id} className={`${paddingClass} text-sm`}>
          {node.name}
        </SelectItem>
      );
    }
  });
  return result;
}

function flattenCategoryTree(nodes: CategoryNode[]): SearchableSelectOption[] {
  const out: SearchableSelectOption[] = [];
  const walk = (list: CategoryNode[]) => {
    list.forEach((n) => {
      out.push({ value: n.id, label: n.name, depth: n.depth });
      if (n.children.length) walk(n.children);
    });
  };
  walk(nodes);
  return out;
}

function getNextRecurrenceDate(current: Date, recType: string): Date {
  switch (recType) {
    case "diario": return addDays(current, 1);
    case "semanal": return addWeeks(current, 1);
    case "quinzenal": return addWeeks(current, 2);
    case "mensal": return addMonths(current, 1);
    case "bimestral": return addMonths(current, 2);
    case "trimestral": return addMonths(current, 3);
    case "semestral": return addMonths(current, 6);
    case "anual": return addYears(current, 1);
    default: return addMonths(current, 1);
  }
}

function generateRecurrenceDates(startDate: string, recType: string, endDate?: string): string[] {
  const dates: string[] = [];
  const maxOccurrences = 365; // safety limit
  const horizon = endDate ? new Date(endDate) : addYears(new Date(startDate), 1);
  let current = new Date(startDate);

  for (let i = 0; i < maxOccurrences; i++) {
    current = getNextRecurrenceDate(current, recType);
    if (current > horizon) break;
    dates.push(current.toISOString().split("T")[0]);
  }
  return dates;
}

const MAX_ATTACHMENTS = 5;

export function TransactionFormDialog({ open, onOpenChange, onCreated, transaction, initialType, editScope = "single" }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { isRequired } = useTransactionFieldSettings();
  const queryClient = useQueryClient();
  const [type, setType] = useState<TransactionType>("despesa");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
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

  // --- Lookup queries (React Query so realtime invalidation works) ---
  const accountsQuery = useQuery({
    queryKey: ["form-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data, error } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const categoriesQuery = useQuery({
    queryKey: ["form-categories", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
      });
      return (data ?? []) as any[];
    },
  });
  const contactsQuery = useQuery({
    queryKey: ["form-contacts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts").select("*")
        .eq("user_id", user!.id).eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  const paymentMethodsQuery = useQuery({
    queryKey: ["form-payment-methods", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data } = await supabase.rpc("get_accessible_payment_methods", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
      });
      return (data ?? []) as any[];
    },
  });
  const categoryCompaniesQuery = useQuery({
    queryKey: ["form-category-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("category_companies").select("category_id, company_id");
      return data ?? [];
    },
  });
  const contactCompaniesQuery = useQuery({
    queryKey: ["form-contact-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("contact_companies").select("contact_id, company_id");
      return data ?? [];
    },
  });
  const paymentMethodCompaniesQuery = useQuery({
    queryKey: ["form-payment-method-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("payment_method_companies" as any) as any)
        .select("payment_method_id, company_id");
      return (data ?? []) as { payment_method_id: string; company_id: string }[];
    },
  });

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];
  const paymentMethods = paymentMethodsQuery.data ?? [];

  const categoryCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (categoryCompaniesQuery.data ?? []).forEach((cc) => {
      const list = map.get(cc.category_id) || [];
      list.push(cc.company_id);
      map.set(cc.category_id, list);
    });
    return map;
  }, [categoryCompaniesQuery.data]);

  const contactCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (contactCompaniesQuery.data ?? []).forEach((cc) => {
      const list = map.get(cc.contact_id) || [];
      list.push(cc.company_id);
      map.set(cc.contact_id, list);
    });
    return map;
  }, [contactCompaniesQuery.data]);

  const paymentMethodCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (paymentMethodCompaniesQuery.data ?? []).forEach((pmc) => {
      const list = map.get(pmc.payment_method_id) || [];
      list.push(pmc.company_id);
      map.set(pmc.payment_method_id, list);
    });
    return map;
  }, [paymentMethodCompaniesQuery.data]);


  // Realtime: invalidate lookup queries when items change anywhere
  useRealtimeSync({
    tables: ["accounts", "categories", "contacts", "payment_methods"],
    invalidateKeyPrefixes: ["form-"],
    enabled: !!user && open,
  });

  const invalidateLookups = () => {
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("form-"),
    });
  };

  // Default account when opening for new transaction; also reset if current selection is no longer in scope
  useEffect(() => {
    if (!open || transaction) return;
    const exists = accountId && accounts.some((a) => a.id === accountId);
    if (!exists) setAccountId(accounts[0]?.id ?? "");
  }, [open, transaction, accounts, accountId]);

  // Populate form when editing
  useEffect(() => {
    if (transaction && open) {
      setType(transaction.transaction_type);
      setDescription(transaction.description);
      setAmount(transaction.amount.toFixed(2).replace(".", ","));
      setDate(transaction.transaction_date);
      setAccountId(transaction.account_id);
      setDestinationAccountId(transaction.destination_account_id ?? "");
      setCategoryId(transaction.category_id ?? "");
      setContactId(transaction.contact_id ?? "");
      setNotes(transaction.notes ?? "");
      setDueDate(transaction.due_date ?? "");
      setPaymentDate(transaction.payment_date ?? "");
      setPaymentMethodId(transaction.payment_method_id ?? "");
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
      if (initialType) setType(initialType);
    }
  }, [transaction, open]);

  const isEditing = !!transaction;

  const filteredCategories = categories.filter((c) => {
    if (type === "transferencia") return true;

    // Filtrar pelo tipo do lançamento (receita/despesa)
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

  // Reset payment method selection if no longer available in current profile scope
  useEffect(() => {
    if (!open || !paymentMethodId) return;
    const exists = filteredPaymentMethods.some((pm) => pm.id === paymentMethodId);
    if (!exists) setPaymentMethodId("");
  }, [open, filteredPaymentMethods, paymentMethodId]);




  // --- Option builders with rich visuals matching each module ---
  const accountOptions: SearchableSelectOption[] = accounts.map((acc) => ({
    value: acc.id,
    label: acc.name,
    keywords: acc.account_type,
    leading: (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: (acc.color || "#1B3A5C") + "22" }}
      >
        <Wallet className="h-3 w-3" style={{ color: acc.color || "#1B3A5C" }} />
      </span>
    ),
  }));

  const flatCategoryOptions: SearchableSelectOption[] = (function () {
    const out: SearchableSelectOption[] = [];
    const walk = (list: CategoryNode[], parentIndex: string) => {
      list.forEach((n, i) => {
        const idx = parentIndex ? `${parentIndex}.${i + 1}` : `${i + 1}`;
        out.push({
          value: n.id,
          label: n.name,
          depth: n.depth,
          keywords: idx,
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
    label: ct.name,
    keywords: `${ct.email ?? ""} ${ct.phone ?? ""} ${ct.document ?? ""}`,
    leading: (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {ct.name.slice(0, 2).toUpperCase()}
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


  const resetForm = () => {
    setType("despesa");
    setDescription("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setDueDate("");
    setPaymentDate("");
    setAccountId(accounts[0]?.id ?? "");
    setDestinationAccountId("");
    setCategoryId("");
    setContactId("");
    setNotes("");
    setPaymentMethodId("");
    setStatus("confirmado");
    setIsRecurring(false);
    setRecurrenceType("mensal");
    setRecurrenceEndDate("");
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
    const parseResult = transactionSchema.safeParse({
      description, amount: numAmount, transaction_type: type,
      transaction_date: date, account_id: accountId || "",
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

    const hasDueDate = !!dueDate && type !== "transferencia";

    const payload: any = {
      transaction_type: type,
      description: description.trim(),
      amount: numAmount,
      transaction_date: date,
      account_id: accountId,
      destination_account_id: type === "transferencia" ? destinationAccountId : null,
      category_id: categoryId || null,
      contact_id: type !== "transferencia" ? (contactId || null) : null,
      notes: notes.trim() || null,
      payment_method_id: paymentMethodId || null,
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
                    const diffMs = new Date(dueDate).getTime() - new Date(date).getTime();
                    const fd = new Date(new Date(futureDate).getTime() + diffMs);
                    return fd.toISOString().split("T")[0];
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
              <TabsTrigger value="receita" className="data-[state=active]:bg-success data-[state=active]:text-success-foreground">
                Receita
              </TabsTrigger>
              <TabsTrigger value="despesa" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
                Despesa
              </TabsTrigger>
              <TabsTrigger value="transferencia">
                Transferência
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Amount */}
          <div className="space-y-2" data-field="amount">
            <Label>Valor</Label>
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
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
          </div>

          {/* Date */}
          <div className="space-y-2" data-field="transaction_date">
            <Label>Data</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Due date - only for receita/despesa */}
          {type !== "transferencia" && (
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
              <p className="text-[11px] text-muted-foreground">
                Se preenchido, o lançamento será tratado como compromisso pendente.
              </p>
            </div>
          )}

          {/* Payment date - only for receita/despesa with confirmed status */}
          {type !== "transferencia" && status === "confirmado" && (
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

          {/* Recurrence */}
          {(
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
              <Label>Categoria{fieldSuffix("category")}</Label>
              <div className="flex gap-2">
                <SearchableSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={flatCategoryOptions}
                  placeholder="Selecione a categoria"
                  searchPlaceholder="Buscar categoria..."
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

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "confirmado" | "pendente" | "cancelado")}>
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
        defaultType={type === "receita" ? "receita" : "despesa"}
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
