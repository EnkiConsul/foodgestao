import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { chartAccountSchema, validateWithToast } from "@/lib/validations";

export interface ChartAccount {
  id: string;
  user_id: string;
  context: "pf" | "pj";
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  allow_transactions: boolean;
  is_active: boolean;
  short_code: string | null;
  is_tax: boolean;
  tax_code: string | null;
  tax_description: string | null;
  visible_pf: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editAccount?: ChartAccount | null;
  defaultParentId?: string | null;
}

function HelpHint({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-xs max-w-xs">{text}</PopoverContent>
    </Popover>
  );
}

export function ChartAccountFormDialog({ open, onOpenChange, onSaved, editAccount, defaultParentId }: Props) {
  const { user } = useAuth();
  const { contextType } = useCompanyContext();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [allowTransactions, setAllowTransactions] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [shortCode, setShortCode] = useState("");
  const [isTax, setIsTax] = useState(false);
  const [taxCode, setTaxCode] = useState("");
  const [taxDescription, setTaxDescription] = useState("");
  const [visiblePf, setVisiblePf] = useState(true);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [originalParentId, setOriginalParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: allAccounts = [] } = useQuery({
    queryKey: ["chart-accounts-for-parent", user?.id, contextType],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("chart_accounts")
        .select("id,code,name,allow_transactions")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .order("code");
      return (data ?? []) as { id: string; code: string; name: string; allow_transactions: boolean }[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-for-chart-account", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editAccount) {
      setCode(editAccount.code);
      setName(editAccount.name);
      setDescription(editAccount.description ?? "");
      setParentId(editAccount.parent_id);
      setOriginalParentId(editAccount.parent_id);
      setAllowTransactions(editAccount.allow_transactions);
      setIsActive(editAccount.is_active);
      setShortCode(editAccount.short_code ?? "");
      setIsTax(editAccount.is_tax);
      setTaxCode(editAccount.tax_code ?? "");
      setTaxDescription(editAccount.tax_description ?? "");
      setVisiblePf(editAccount.visible_pf);
      (supabase as any)
        .from("chart_account_companies")
        .select("company_id")
        .eq("chart_account_id", editAccount.id)
        .then(({ data }: { data: { company_id: string }[] | null }) => {
          setSelectedCompanies(new Set((data ?? []).map((d) => d.company_id)));
        });
    } else {
      setCode("");
      setName("");
      setDescription("");
      setParentId(defaultParentId ?? null);
      setOriginalParentId(null);
      setAllowTransactions(true);
      setIsActive(true);
      setShortCode("");
      setIsTax(false);
      setTaxCode("");
      setTaxDescription("");
      setVisiblePf(true);
      setSelectedCompanies(new Set(companies.map((c) => c.id)));
    }
  }, [open, editAccount, defaultParentId]);

  const parentOptions = allAccounts.filter((a) => a.id !== editAccount?.id && !a.allow_transactions);

  const toggleCompany = (id: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const validated = validateWithToast(
      chartAccountSchema,
      {
        name,
        short_code: shortCode || null,
        is_tax: isTax,
        tax_code: taxCode || null,
        tax_description: taxDescription || null,
      },
      toast.error
    );
    if (!validated) return;

    setSaving(true);

    let accountId = editAccount?.id;
    if (editAccount) {
      // If parent changed, move (recalculates codes in cascade)
      if (parentId !== originalParentId) {
        const { error: moveErr } = await (supabase as any).rpc("chart_account_move", {
          _id: editAccount.id,
          _new_parent_id: parentId,
        });
        if (moveErr) { toast.error("Erro ao mover conta", { description: moveErr.message }); setSaving(false); return; }
      }
      const { error } = await (supabase as any).from("chart_accounts").update({
        name: name.trim(),
        description: description.trim() || null,
        allow_transactions: allowTransactions,
        is_active: isActive,
        short_code: shortCode.trim() || null,
        is_tax: isTax,
        tax_code: isTax ? taxCode.trim() || null : null,
        tax_description: isTax ? taxDescription.trim() || null : null,
        visible_pf: visiblePf,
      }).eq("id", editAccount.id);
      if (error) { toast.error("Erro ao atualizar", { description: error.message }); setSaving(false); return; }
    } else {
      // code is auto-filled by trigger
      const { data, error } = await (supabase as any).from("chart_accounts").insert({
        user_id: user.id,
        context: contextType,
        name: name.trim(),
        description: description.trim() || null,
        parent_id: parentId,
        allow_transactions: allowTransactions,
        is_active: isActive,
        short_code: shortCode.trim() || null,
        is_tax: isTax,
        tax_code: isTax ? taxCode.trim() || null : null,
        tax_description: isTax ? taxDescription.trim() || null : null,
        visible_pf: visiblePf,
      }).select("id").single();
      if (error || !data) { toast.error("Erro ao criar", { description: error?.message }); setSaving(false); return; }
      accountId = data.id;
    }

    if (accountId) {
      await (supabase as any).from("chart_account_companies").delete().eq("chart_account_id", accountId);
      if (selectedCompanies.size > 0) {
        const rows = Array.from(selectedCompanies).map((company_id) => ({ chart_account_id: accountId, company_id }));
        await (supabase as any).from("chart_account_companies").insert(rows);
      }
    }

    toast.success(editAccount ? "Conta atualizada" : "Conta criada");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editAccount ? "Editar Conta Contábil" : "Nova Conta Contábil"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {editAccount && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Índice:</span>
              <span className="font-mono font-semibold">{code}</span>
              <span className="text-xs text-muted-foreground ml-auto">Gerado automaticamente pela hierarquia</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Nome da Conta</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Caixa Geral" maxLength={120} />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Conta Pai (Sintética)</Label>
            <Select value={parentId ?? "__none__"} onValueChange={(v) => setParentId(v === "__none__" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma (raiz)</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Permitir Lançamentos</Label>
                <HelpHint text="Sim = Conta Analítica: aceita lançamentos diretos. Não = Conta Sintética: serve apenas para agrupar contas filhas e totalizar." />
              </div>
              <p className="text-xs text-muted-foreground">
                {allowTransactions ? "Analítica — aceita lançamentos" : "Sintética — agrupadora"}
              </p>
            </div>
            <Switch checked={allowTransactions} onCheckedChange={setAllowTransactions} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Situação</Label>
              <p className="text-xs text-muted-foreground">
                {isActive ? "Ativa — permite novos lançamentos" : "Inativa — preserva histórico, bloqueia novos lançamentos"}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Conta Contábil Resumida</Label>
              <HelpHint text="Código resumido usado em relatórios contábeis simplificados, como um alias curto da conta." />
            </div>
            <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Ex: CX-01" maxLength={30} />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isTax} onCheckedChange={(v) => setIsTax(!!v)} />
              É conta de Imposto
            </label>
            {isTax && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Código do Imposto</Label>
                  <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="Ex: 06" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Descrição do Imposto</Label>
                  <Input value={taxDescription} onChange={(e) => setTaxDescription(e.target.value)} placeholder="Ex: Simples, IOF..." maxLength={100} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-semibold">Visibilidade</Label>
            <p className="text-xs text-muted-foreground">Selecione onde esta conta ficará disponível</p>
            {companies.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empresas</p>
                  <div className="flex gap-2">
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedCompanies(new Set(companies.map((c) => c.id)))}>Todos</button>
                    <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSelectedCompanies(new Set())}>Nenhum</button>
                  </div>
                </div>
                {companies.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={selectedCompanies.has(c.id)} onCheckedChange={() => toggleCompany(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : editAccount ? "Salvar" : "Criar Conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
