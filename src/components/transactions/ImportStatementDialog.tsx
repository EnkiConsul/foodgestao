import { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2, Plus, XCircle } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { formatBRL } from "@/lib/billing";
import { amountColorClass, amountSignPrefix, transactionSignedAmount } from "@/lib/transaction-sign";
import { parseNubankStatementPdfWithSummary } from "@/lib/statement-import/nubankPdf";
import type { Reconciliation } from "@/lib/statement-import/nubankParser";
import { suggestForEntries, markDuplicates } from "@/lib/statement-import/suggest";
import type { ReviewRow } from "@/lib/statement-import/types";
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";

type Account = { id: string; name: string };
type Category = { id: string; name: string; transaction_type: "entrada" | "saida" };
type Contact = { id: string; name: string; contact_type: "cliente" | "fornecedor" | "ambos" | string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  defaultAccountId?: string | null;
}

type Step = "upload" | "review" | "done";
type DuplicateDecision = "none" | "pending" | "skip" | "include" | "manual";

export function ImportStatementDialog({ open, onOpenChange, onImported, defaultAccountId }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>(defaultAccountId ?? "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [failures, setFailures] = useState<Array<{ row: ReviewRow; reason: string }>>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [duplicateDecision, setDuplicateDecision] = useState<DuplicateDecision>("none");

  // Quick-create state (reuses full CategoryFormDialog / ContactFormDialog)
  const [quickCat, setQuickCat] = useState<{ rowIdx: number; type: "entrada" | "saida"; name: string } | null>(null);
  const [quickContact, setQuickContact] = useState<{ rowIdx: number; name: string; contactType: "cliente" | "fornecedor" | "ambos" } | null>(null);

  const reset = useCallback(() => {
    setStep("upload"); setFile(null); setAccountId(defaultAccountId ?? ""); setRows([]); setReconciliation(null);
    setImportedCount(0); setDuplicateCount(0); setFailures([]); setProgress(null);
    setDuplicateDecision("none");
    setQuickCat(null); setQuickContact(null);
  }, [defaultAccountId]);

  useEffect(() => {
    if (open && defaultAccountId) setAccountId(defaultAccountId);
  }, [open, defaultAccountId]);

  useEffect(() => {
    if (!open) { reset(); return; }
    if (!user) return;
    (async () => {
      const { data: accs } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
        _include_inactive: false,
      });
      setAccounts(((accs ?? []) as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name })));

      const { data: cats } = await supabase.rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
        _transaction_type: undefined,
      });
      setCategories(((cats ?? []) as Array<{ id: string; name: string; transaction_type: string }>).map((c) => ({
        id: c.id, name: c.name, transaction_type: c.transaction_type as "entrada" | "saida",
      })));

      const { data: cts } = await supabase.from("contacts").select("id, name, contact_type").eq("user_id", user.id);
      setContacts((cts ?? []) as Contact[]);
    })();
  }, [open, user, contextType, selectedCompanyId, reset]);

  const parseFile = async () => {
    if (!file || !accountId) { toast.error("Selecione a conta e o arquivo"); return; }
    setBusy(true);
    try {
      const { entries, reconciliation: rec } = await parseNubankStatementPdfWithSummary(file);
      if (entries.length === 0) {
        toast.error("Nenhuma movimentação identificada no PDF");
        setBusy(false);
        return;
      }
      const withSug = await suggestForEntries(entries, {
        userId: user!.id,
        context: contextType,
        companyId: contextType === "pj" ? selectedCompanyId : null,
      });
      const withDup = await markDuplicates(withSug, accountId);
      setRows(withDup);
      setReconciliation(rec);
      setDuplicateDecision(withDup.some((r) => r.duplicate) ? "pending" : "none");
      setStep("review");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o extrato. Verifique se é um PDF do Nubank.");
    } finally {
      setBusy(false);
    }
  };

  const catsByType = useMemo(() => {
    const byType: Record<string, Category[]> = { receita: [], despesa: [] };
    for (const c of categories) if (byType[c.transaction_type]) byType[c.transaction_type].push(c);
    return byType;
  }, [categories]);

  const summary = useMemo(() => {
    const sel = rows.filter((r) => r.include);
    const dup = rows.filter((r) => r.duplicate).length;
    const dupSelected = rows.filter((r) => r.duplicate && r.include).length;
    const receitas = sel.filter((r) => r.transaction_type === "entrada").reduce((s, r) => s + r.amount, 0);
    const despesas = sel.filter((r) => r.transaction_type === "saida").reduce((s, r) => s + r.amount, 0);
    return { selected: sel.length, dup, dupSelected, receitas, despesas };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const applyDuplicateDecision = (decision: "skip" | "include" | "manual") => {
    setRows((prev) =>
      prev.map((r) => {
        if (!r.duplicate) return r;
        if (decision === "include") return { ...r, include: true };
        if (decision === "skip") return { ...r, include: false };
        // manual: start unchecked, user picks per row
        return { ...r, include: false };
      })
    );
    setDuplicateDecision(decision);
  };

  const mapPgError = (err: { code?: string; message?: string } | null | undefined): string => {
    if (!err) return "Erro desconhecido";
    const code = err.code ?? "";
    const msg = err.message ?? "";
    if (code === "23505") return "Duplicado (já existia)";
    if (code === "42501") return "Sem permissão para gravar neste perfil/empresa";
    if (/forma de pagamento/i.test(msg)) return "Forma de pagamento não vinculada à conta/perfil";
    if (/categoria/i.test(msg)) return "Categoria inválida ou não vinculada";
    if (/violates row-level security/i.test(msg)) return "Bloqueado por RLS (perfil/empresa)";
    if (code === "23503") return "Referência inválida (categoria/contato/conta)";
    if (code === "23514") return `Violação de regra: ${msg}`;
    return msg || `Erro ${code}`;
  };

  const doImport = async () => {
    if (!user || !accountId) return;
    const toInsert = rows.filter((r) => r.include);
    if (toInsert.length === 0) { toast.error("Nada selecionado para importar"); return; }
    if (contextType === "pj" && !selectedCompanyId) {
      toast.error("Selecione uma empresa antes de importar"); return;
    }
    setBusy(true);
    setProgress({ done: 0, total: toInsert.length });
    const localFailures: Array<{ row: ReviewRow; reason: string }> = [];
    let inserted = 0;
    let duplicates = rows.filter((r) => r.duplicate && !r.include).length;
    const reimportBatchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const buildPayload = (r: ReviewRow, idx: number) => ({
      user_id: user.id,
      context: contextType,
      company_id: contextType === "pj" ? selectedCompanyId : null,
      account_id: accountId,
      transaction_type: r.transaction_type,
      description: r.description_override?.trim() || r.description,
      amount: r.amount,
      amount_paid: r.amount,
      transaction_date: r.date,
      payment_date: r.date,
      due_date: r.date,
      status: "confirmado" as const,
      bill_status: "pago" as const,
      category_id: r.category_id,
      contact_id: r.contact_id,
      import_hash: r.duplicate
        ? `${r.import_hash}:reimport:${reimportBatchId}:${idx}`
        : r.import_hash,
    });

    try {
      const chunkSize = 50;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const sliceRows = toInsert.slice(i, i + chunkSize);
        const slice = sliceRows.map((r, offset) => buildPayload(r, i + offset));
        const { error, count } = await supabase.from("transactions").insert(slice, { count: "exact" });
        if (!error) {
          inserted += count ?? slice.length;
        } else if (error.code === "23505" && sliceRows.length === 1) {
          duplicates += 1;
        } else {
          // Fall back to per-row inserts to isolate the failure(s)
          for (const [offset, r] of sliceRows.entries()) {
            const { error: rowErr } = await supabase.from("transactions").insert(buildPayload(r, i + offset));
            if (!rowErr) {
              inserted += 1;
            } else if (rowErr.code === "23505") {
              duplicates += 1;
            } else {
              console.warn("[import] row failed", rowErr, r);
              localFailures.push({ row: r, reason: mapPgError(rowErr) });
            }
          }
        }
        setProgress({ done: Math.min(i + sliceRows.length, toInsert.length), total: toInsert.length });
      }

      setImportedCount(inserted);
      setDuplicateCount(duplicates);
      setFailures(localFailures);
      setStep("done");
      if (localFailures.length === 0) {
        toast.success(`${inserted} lançamento(s) importado(s)${duplicates ? ` · ${duplicates} duplicado(s)` : ""}`);
      } else {
        toast.warning(`${inserted} importado(s), ${duplicates} duplicado(s), ${localFailures.length} com erro`);
      }
      onImported();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao importar";
      console.error(e);
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };


  const refetchCategories = async () => {
    if (!user) return;
    const { data: cats } = await supabase.rpc("get_accessible_categories", {
      _context: contextType,
      _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      _transaction_type: undefined,
    });
    setCategories(((cats ?? []) as Array<{ id: string; name: string; transaction_type: string }>).map((c) => ({
      id: c.id, name: c.name, transaction_type: c.transaction_type as "entrada" | "saida",
    })));
  };

  const refetchContacts = async () => {
    if (!user) return;
    const { data: cts } = await supabase.from("contacts").select("id, name, contact_type").eq("user_id", user.id);
    setContacts((cts ?? []) as Contact[]);
  };


  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Extrato Bancário</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Envie o PDF do extrato (Nubank) para gerar os lançamentos automaticamente."}
            {step === "review" && "Revise as movimentações, ajuste categorias/contatos e escolha o que importar."}
            {step === "done" && "Importação concluída."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div>
              <Label>Conta financeira de destino</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Arquivo do extrato (PDF)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && <span className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />{file.name}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Nesta versão suportamos extratos PDF do Nubank. Outros bancos em breve.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={parseFile} disabled={!file || !accountId || busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Ler extrato
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex items-center gap-4 text-xs">
              <span>Selecionados: <strong>{summary.selected}</strong></span>
              <span className={amountColorClass(summary.receitas)}>Receitas: <strong>{formatBRL(summary.receitas)}</strong></span>
              <span className={amountColorClass(-summary.despesas)}>Despesas: <strong>{formatBRL(summary.despesas)}</strong></span>
              {summary.dup > 0 && (
                <span className="flex items-center gap-2 text-amber-600 flex-wrap">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.dup} duplicado(s) — {summary.dupSelected} selecionado(s) para reimportar
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-amber-700 underline"
                    onClick={() =>
                      setRows((prev) => prev.map((r) => (r.duplicate ? { ...r, include: true } : r)))
                    }
                  >
                    Marcar todas duplicadas
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-amber-700 underline"
                    onClick={() =>
                      setRows((prev) => prev.map((r) => (r.duplicate ? { ...r, include: false } : r)))
                    }
                  >
                    Desmarcar todas duplicadas
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-amber-700 underline"
                    onClick={() => setDuplicateDecision("pending")}
                  >
                    Alterar decisão
                  </Button>
                </span>
              )}
            </div>
            {reconciliation && (reconciliation.entradas_diff !== null || reconciliation.saidas_diff !== null || reconciliation.balance_diff !== null) && (
              <div
                className={`flex items-center gap-2 text-xs rounded-md border px-3 py-2 ${
                  reconciliation.balanced
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {reconciliation.balanced ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Extrato confere: totais parseados batem com o resumo do PDF.
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    <span>
                      Divergência vs. resumo do PDF:
                      {reconciliation.entradas_diff !== null && reconciliation.entradas_diff !== 0 && (
                        <> entradas {reconciliation.entradas_diff > 0 ? "+" : ""}{formatBRL(reconciliation.entradas_diff)};</>
                      )}
                      {reconciliation.saidas_diff !== null && reconciliation.saidas_diff !== 0 && (
                        <> saídas {reconciliation.saidas_diff > 0 ? "+" : ""}{formatBRL(reconciliation.saidas_diff)};</>
                      )}
                      {reconciliation.balance_diff !== null && reconciliation.balance_diff !== 0 && (
                        <> saldo {reconciliation.balance_diff > 0 ? "+" : ""}{formatBRL(reconciliation.balance_diff)}.</>
                      )}
                      {" "}Revise antes de importar.
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="flex-1 overflow-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={rows.every((r) => r.include)}
                        onCheckedChange={(v) => setRows((prev) => prev.map((r) => ({ ...r, include: !!v })))}
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.duplicate && !r.include ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox checked={r.include} onCheckedChange={(v) => updateRow(i, { include: !!v })} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(r.date, "dd/MM/yyyy")}</TableCell>
                      <TableCell className="min-w-[220px]">
                        <Input
                          value={r.description_override ?? r.description}
                          onChange={(e) => updateRow(i, { description_override: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {r.duplicate && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            {r.include ? "Reimportar duplicado" : "Já importado"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.transaction_type === "entrada" ? "default" : "destructive"} className="text-[10px]">
                          {r.transaction_type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Select
                          value={r.category_id ?? ""}
                          onValueChange={(v) => {
                            if (v === "__new__") {
                              const suggested = (r.description_override ?? r.description).split(" - ")[0]?.slice(0, 40) ?? "";
                              setQuickCat({ rowIdx: i, type: r.transaction_type, name: suggested });
                            } else {
                              updateRow(i, { category_id: v || null });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__" className="text-primary font-medium">
                              <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Nova categoria…</span>
                            </SelectItem>
                            {(catsByType[r.transaction_type] ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Select
                          value={r.contact_id ?? ""}
                          onValueChange={(v) => {
                            if (v === "__new__") {
                              const suggested = r.counterparty_name?.slice(0, 60) ?? (r.description_override ?? r.description).split(" - ").slice(-1)[0]?.slice(0, 60) ?? "";
                              setQuickContact({
                                rowIdx: i,
                                name: suggested,
                                contactType: r.transaction_type === "entrada" ? "cliente" : "fornecedor",
                              });
                            } else {
                              updateRow(i, { contact_id: v || null });
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__" className="text-primary font-medium">
                              <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Novo contato…</span>
                            </SelectItem>
                            {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {(() => {
                        const signed = transactionSignedAmount(r);
                        return (
                          <TableCell className={`text-right whitespace-nowrap text-xs font-semibold ${amountColorClass(signed)}`}>
                            {amountSignPrefix(signed)} {formatBRL(Math.abs(r.amount))}
                          </TableCell>
                        );
                      })()}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={busy}>Voltar</Button>
              <Button onClick={doImport} disabled={busy || summary.selected === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {busy && progress
                  ? `Importando ${progress.done} / ${progress.total}…`
                  : `Importar ${summary.selected} lançamento(s)`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3">
              {failures.length === 0 ? (
                <CheckCircle2 className="h-10 w-10 text-success shrink-0" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-warning shrink-0" />
              )}
              <div className="text-sm">
                <p className="font-medium">Importação concluída</p>
                <p className="text-muted-foreground">
                  Confira o resultado abaixo. Sem limite de importação — todos os lançamentos do extrato podem ser importados.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-semibold text-success">{importedCount}</div>
                <div className="text-xs text-muted-foreground">Importados</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-semibold">{duplicateCount}</div>
                <div className="text-xs text-muted-foreground">Duplicados</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className={`text-2xl font-semibold ${failures.length > 0 ? "text-destructive" : ""}`}>
                  {failures.length}
                </div>
                <div className="text-xs text-muted-foreground">Com erro</div>
              </div>
            </div>

            {failures.length > 0 && (
              <div className="rounded-md border">
                <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium">
                  Lançamentos não importados
                </div>
                <div className="max-h-64 overflow-auto divide-y">
                  {failures.map((f, i) => (
                    <div key={i} className="px-3 py-2 text-xs flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">
                          <span className="font-medium">{f.row.date}</span>
                          {" · "}
                          {(() => {
                            const signed = transactionSignedAmount(f.row);
                            return (
                              <span className={amountColorClass(signed)}>
                                {amountSignPrefix(signed)}
                                {Math.abs(f.row.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </span>
                            );
                          })()}
                          {" · "}
                          <span className="text-muted-foreground">{f.row.description_override?.trim() || f.row.description}</span>
                        </div>
                        <div className="text-destructive mt-0.5">{f.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              {failures.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Re-open review with only failed rows selected for correction
                    const failedHashes = new Set(failures.map((f) => f.row.import_hash));
                    setRows((prev) => prev.map((r) => ({ ...r, include: failedHashes.has(r.import_hash) })));
                    setFailures([]);
                    setStep("review");
                  }}
                >
                  Revisar erros
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      </Dialog>

      <AlertDialog
        open={step === "review" && duplicateDecision === "pending"}
        onOpenChange={(o) => { if (!o) applyDuplicateDecision("skip"); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Como tratar as duplicatas?</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos {summary.dup} lançamento(s) que já foram importados anteriormente para esta conta.
              Escolha como deseja proceder — você poderá marcar/desmarcar cada linha individualmente na revisão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => applyDuplicateDecision("skip")}>
              Ignorar todas
            </AlertDialogCancel>
            <Button variant="secondary" onClick={() => applyDuplicateDecision("manual")}>
              Escolher manualmente
            </Button>
            <AlertDialogAction onClick={() => applyDuplicateDecision("include")}>
              Importar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Quick create Category — reuses the full CategoryFormDialog */}
      <CategoryFormDialog
        open={!!quickCat}
        onOpenChange={(o) => { if (!o) setQuickCat(null); }}
        defaultName={quickCat?.name}
        defaultType={quickCat?.type}
        onSaved={async (newId) => {
          const rowIdx = quickCat?.rowIdx;
          setQuickCat(null);
          await refetchCategories();
          if (typeof rowIdx === "number" && newId) {
            updateRow(rowIdx, { category_id: newId });
          }
        }}
      />

      {/* Quick create Contact — reuses the full ContactFormDialog */}
      <ContactFormDialog
        open={!!quickContact}
        onOpenChange={(o) => { if (!o) setQuickContact(null); }}
        defaultName={quickContact?.name}
        defaultContactType={quickContact?.contactType}
        onSaved={async (newId) => {
          const rowIdx = quickContact?.rowIdx;
          setQuickContact(null);
          await refetchContacts();
          if (typeof rowIdx === "number" && newId) {
            updateRow(rowIdx, { contact_id: newId });
          }
        }}
      />

    </>
  );
}
