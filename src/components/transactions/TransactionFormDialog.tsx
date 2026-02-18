import { useState, useEffect } from "react";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { transactionSchema, validateWithToast } from "@/lib/validations";
import { Calendar, Repeat, Paperclip, X, FileText, Upload, CheckCircle, Clock, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/integrations/supabase/types";

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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  transaction?: EditableTransaction | null;
  initialType?: TransactionType;
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

export function TransactionFormDialog({ open, onOpenChange, onCreated, transaction, initialType }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [type, setType] = useState<TransactionType>("despesa");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
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

  const [accounts, setAccounts] = useState<Tables<"accounts">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [contacts, setContacts] = useState<Tables<"contacts">[]>([]);
  const [contactCompanyIds, setContactCompanyIds] = useState<Map<string, string[]>>(new Map());
  const [paymentMethods, setPaymentMethods] = useState<Tables<"payment_methods">[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [categoryCompanyIds, setCategoryCompanyIds] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!user || !open) return;
    const loadData = async () => {
      const [accRes, catRes, pmRes, ccRes, contactRes, contCompRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("categories").select("*").eq("user_id", user.id).order("transaction_type").order("sort_order").order("name"),
        supabase.from("payment_methods").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("category_companies").select("category_id, company_id"),
        supabase.from("contacts").select("*").eq("user_id", user.id).eq("is_active", true).order("name"),
        supabase.from("contact_companies").select("contact_id, company_id"),
      ]);
      setAccounts(accRes.data ?? []);
      setCategories(catRes.data ?? []);
      setPaymentMethods(pmRes.data ?? []);
      setContacts(contactRes.data ?? []);
      if (accRes.data?.[0] && !accountId) setAccountId(accRes.data[0].id);

      const map = new Map<string, string[]>();
      (ccRes.data ?? []).forEach((cc) => {
        const list = map.get(cc.category_id) || [];
        list.push(cc.company_id);
        map.set(cc.category_id, list);
      });
      setCategoryCompanyIds(map);

      const contMap = new Map<string, string[]>();
      (contCompRes.data ?? []).forEach((cc) => {
        const list = contMap.get(cc.contact_id) || [];
        list.push(cc.company_id);
        contMap.set(cc.contact_id, list);
      });
      setContactCompanyIds(contMap);
    };
    loadData();
  }, [user, open]);

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

  const resetForm = () => {
    setType("despesa");
    setDescription("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setDueDate("");
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
      const filePath = `${user.id}/${transactionId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from("transaction-attachments")
        .upload(filePath, file, { upsert: true });
      if (error) {
        toast.error(`Erro ao enviar ${file.name}`, { description: error.message });
        continue;
      }
      const { data: urlData } = supabase.storage
        .from("transaction-attachments")
        .getPublicUrl(filePath);
      await supabase.from("transaction_attachments").insert({
        transaction_id: transactionId,
        user_id: user.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        file_type: file.type || ext || null,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numAmount = parseCurrencyToNumber(amount);
    const validated = validateWithToast(transactionSchema, {
      description, amount: numAmount, transaction_type: type,
      transaction_date: date, account_id: accountId || "",
      destination_account_id: type === "transferencia" ? destinationAccountId || "" : null,
      category_id: categoryId || null, notes: notes || null,
      payment_method_id: paymentMethodId || null,
      due_date: dueDate || null,
    }, toast.error);
    if (!validated) return;
    if (type === "transferencia" && !destinationAccountId) return toast.error("Selecione a conta de destino");

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
      payload.payment_date = date;
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
      const { error } = await supabase.from("transactions").update(payload).eq("id", transaction.id);
      if (error) {
        toast.error("Erro ao salvar", { description: error.message });
      } else {
        await supabase.rpc("insert_audit_log", {
          _action: "transaction_updated",
          _entity_type: "transaction",
          _entity_id: transaction.id,
          _details: { target_name: description.trim(), amount: String(numAmount), type },
        });
        toast.success("Lançamento atualizado!");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type tabs */}
          <Tabs value={type} onValueChange={(v) => setType(v as TransactionType)}>
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
          <div className="space-y-2">
            <Label>Valor</Label>
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado, Salário..."
              maxLength={200}
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Data de vencimento (opcional)</Label>
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
          <div className="space-y-2">
            <Label>{type === "transferencia" ? "Conta de origem" : "Conta"}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination account (transfer) */}
          {type === "transferencia" && (
            <div className="space-y-2">
              <Label>Conta de destino</Label>
              <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o destino" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== accountId).map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category - hierarchical display */}
          {type !== "transferencia" && (
            <div className="space-y-2">
              <Label>Categoria (opcional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {renderCategoryNodes(categoryTree)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contact (Cliente/Fornecedor) */}
          {type !== "transferencia" && (
            <div className="space-y-2">
              <Label>Cliente/Fornecedor (opcional)</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o contato" />
                </SelectTrigger>
                <SelectContent>
                  {filteredContacts.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Forma de pagamento (opcional)</Label>
            <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações adicionais..."
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label>Anexos (opcional) — {totalAttachments}/5</Label>
            {/* Existing attachments */}
            {existingAttachments.filter(a => !removedAttachmentIds.includes(a.id)).map((att) => (
              <div key={att.id} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{att.file_name}</span>
                <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">Ver</a>
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

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : isEditing ? "Atualizar Lançamento" : "Salvar Lançamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
