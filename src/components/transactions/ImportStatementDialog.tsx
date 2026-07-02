import { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { format } from "date-fns";
import { formatBRL } from "@/lib/billing";
import { parseNubankStatementPdf } from "@/lib/statement-import/nubankPdf";
import { suggestForEntries, markDuplicates } from "@/lib/statement-import/suggest";
import type { ReviewRow } from "@/lib/statement-import/types";

type Account = { id: string; name: string };
type Category = { id: string; name: string; transaction_type: "receita" | "despesa" };
type Contact = { id: string; name: string; contact_type: "cliente" | "fornecedor" | "ambos" | string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type Step = "upload" | "review" | "done";

export function ImportStatementDialog({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  // Quick-create state
  const [quickCat, setQuickCat] = useState<{ rowIdx: number; type: "receita" | "despesa"; name: string } | null>(null);
  const [quickContact, setQuickContact] = useState<{ rowIdx: number; name: string; contactType: "cliente" | "fornecedor" | "ambos" } | null>(null);
  const [savingQuick, setSavingQuick] = useState(false);

  const reset = useCallback(() => {
    setStep("upload"); setFile(null); setAccountId(""); setRows([]); setImportedCount(0);
    setQuickCat(null); setQuickContact(null);
  }, []);

  useEffect(() => {
    if (!open) { reset(); return; }
    if (!user) return;
    (async () => {
      const { data: accs } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
        _include_inactive: false,
      });
      setAccounts(((accs ?? []) as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name })));

      const { data: cats } = await supabase.rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId : null,
        _transaction_type: null,
      });
      setCategories(((cats ?? []) as Array<{ id: string; name: string; transaction_type: string }>).map((c) => ({
        id: c.id, name: c.name, transaction_type: c.transaction_type as "receita" | "despesa",
      })));

      const { data: cts } = await supabase.from("contacts").select("id, name, contact_type").eq("user_id", user.id);
      setContacts((cts ?? []) as Contact[]);
    })();
  }, [open, user, contextType, selectedCompanyId, reset]);

  const parseFile = async () => {
    if (!file || !accountId) { toast.error("Selecione a conta e o arquivo"); return; }
    setBusy(true);
    try {
      const entries = await parseNubankStatementPdf(file);
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
    const receitas = sel.filter((r) => r.transaction_type === "receita").reduce((s, r) => s + r.amount, 0);
    const despesas = sel.filter((r) => r.transaction_type === "despesa").reduce((s, r) => s + r.amount, 0);
    return { selected: sel.length, dup, receitas, despesas };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const doImport = async () => {
    if (!user || !accountId) return;
    const toInsert = rows.filter((r) => r.include);
    if (toInsert.length === 0) { toast.error("Nada selecionado para importar"); return; }
    setBusy(true);
    try {
      const payload = toInsert.map((r) => ({
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
        import_hash: r.import_hash,
      }));

      // Insert in chunks to avoid payload limits
      const chunkSize = 100;
      let inserted = 0;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const slice = payload.slice(i, i + chunkSize);
        const { error, count } = await supabase.from("transactions").insert(slice, { count: "exact" });
        if (error) {
          // Duplicate hash conflicts are treated as skipped
          if (error.code !== "23505") throw error;
        } else {
          inserted += count ?? slice.length;
        }
      }
      setImportedCount(inserted);
      setStep("done");
      toast.success(`${inserted} lançamento(s) importado(s)`);
      onImported();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao importar";
      console.error(e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const createQuickCategory = async () => {
    if (!user || !quickCat) return;
    const name = quickCat.name.trim();
    if (!name) { toast.error("Informe o nome da categoria"); return; }
    setSavingQuick(true);
    try {
      const { data: newCat, error } = await supabase.from("categories").insert({
        user_id: user.id,
        name,
        transaction_type: quickCat.type,
        context: contextType,
        visible_pf: contextType === "pf",
      } as any).select("id, name, transaction_type").single();
      if (error || !newCat) throw error ?? new Error("Falha ao criar categoria");

      if (contextType === "pj" && selectedCompanyId) {
        await supabase.from("category_companies").insert([{ category_id: (newCat as any).id, company_id: selectedCompanyId }]);
      }

      const created: Category = {
        id: (newCat as any).id,
        name: (newCat as any).name,
        transaction_type: (newCat as any).transaction_type,
      };
      setCategories((prev) => [...prev, created]);
      updateRow(quickCat.rowIdx, { category_id: created.id });
      toast.success("Categoria criada");
      setQuickCat(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar categoria";
      toast.error(msg);
    } finally {
      setSavingQuick(false);
    }
  };

  const createQuickContact = async () => {
    if (!user || !quickContact) return;
    const name = quickContact.name.trim();
    if (!name) { toast.error("Informe o nome do contato"); return; }
    setSavingQuick(true);
    try {
      const { data: newContact, error } = await supabase.from("contacts").insert({
        user_id: user.id,
        name,
        contact_type: quickContact.contactType,
        visible_pf: contextType === "pf",
      } as any).select("id, name, contact_type").single();
      if (error || !newContact) throw error ?? new Error("Falha ao criar contato");

      if (contextType === "pj" && selectedCompanyId) {
        await supabase.from("contact_companies" as any).insert([{ contact_id: (newContact as any).id, company_id: selectedCompanyId }] as any);
      }

      const created: Contact = {
        id: (newContact as any).id,
        name: (newContact as any).name,
        contact_type: (newContact as any).contact_type,
      };
      setContacts((prev) => [...prev, created]);
      updateRow(quickContact.rowIdx, { contact_id: created.id });
      toast.success("Contato criado");
      setQuickContact(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar contato";
      toast.error(msg);
    } finally {
      setSavingQuick(false);
    }
  };

  return (
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
              <Label>Conta bancária de destino</Label>
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
              <span className="text-success">Receitas: <strong>{formatBRL(summary.receitas)}</strong></span>
              <span className="text-destructive">Despesas: <strong>{formatBRL(summary.despesas)}</strong></span>
              {summary.dup > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> {summary.dup} duplicata(s) desmarcada(s)
                </span>
              )}
            </div>
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
                    <TableRow key={i} className={r.duplicate ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox checked={r.include} onCheckedChange={(v) => updateRow(i, { include: !!v })} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="min-w-[220px]">
                        <Input
                          value={r.description_override ?? r.description}
                          onChange={(e) => updateRow(i, { description_override: e.target.value })}
                          className="h-8 text-xs"
                        />
                        {r.duplicate && <Badge variant="outline" className="mt-1 text-[10px]">Já importado</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.transaction_type === "receita" ? "default" : "destructive"} className="text-[10px]">
                          {r.transaction_type === "receita" ? "Receita" : "Despesa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Select value={r.category_id ?? ""} onValueChange={(v) => updateRow(i, { category_id: v || null })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {(catsByType[r.transaction_type] ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Select value={r.contact_id ?? ""} onValueChange={(v) => updateRow(i, { contact_id: v || null })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={`text-right whitespace-nowrap text-xs font-semibold ${r.transaction_type === "receita" ? "text-success" : "text-destructive"}`}>
                        {r.transaction_type === "receita" ? "+" : "−"} {formatBRL(r.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")} disabled={busy}>Voltar</Button>
              <Button onClick={doImport} disabled={busy || summary.selected === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Importar {summary.selected} lançamento(s)
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="text-sm">
              <strong>{importedCount}</strong> lançamento(s) importado(s) com sucesso.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
