import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { contactSchema, validateWithToast } from "@/lib/validations";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { Loader2, Search } from "lucide-react";
import { maskCpfCnpj, isValidCpf } from "@/lib/cpf";
import { isValidCnpj } from "@/lib/cnpj";
import { normalizeDocumento, isSameDocumento } from "@/lib/documento";
import { cn } from "@/lib/utils";
import { notifyCnpjSuccess, notifyCnpjError } from "@/lib/cnpj-messages";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newId?: string) => void;
  editContact?: Tables<"contacts"> | null;
  defaultName?: string;
  defaultContactType?: "cliente" | "fornecedor" | "ambos";
  /** Documento pré-preenchido (usado só na criação, ex.: vindo do extrato bancário). */
  defaultDocument?: string | null;
  /** Empresas já marcadas na criação (ex.: empresa em contexto na conciliação). */
  defaultCompanyIds?: string[];
  /** Quando há empresa pré-selecionada, o contato nasce oculto no PF. */
  defaultVisiblePf?: boolean;
}

type DuplicateHit = { id: string; name: string } | null;

/**
 * Cache da consulta de duplicidade por chave canônica (documento normalizado +
 * contato ignorado na edição). Evita reconsultar o banco enquanto o usuário
 * digita/edita e desduplica chamadas simultâneas para a mesma chave.
 */
const DUP_CACHE_TTL_MS = 60_000;
const dupCache = new Map<string, { at: number; value: DuplicateHit }>();
const dupInflight = new Map<string, Promise<DuplicateHit>>();

function dupCacheKey(docKey: string, ignoreId?: string | null) {
  return `${docKey}|${ignoreId ?? ""}`;
}

/** Invalida o cache (usar após criar/editar contato, que muda o resultado). */
function invalidateDuplicateCache() {
  dupCache.clear();
  dupInflight.clear();
}

/**
 * Busca direcionada de duplicidade por documento: consulta apenas as variações
 * possíveis de gravação (com e sem máscara) em vez de baixar a lista inteira.
 */
async function findDuplicateByDocument(
  docKey: string,
  ignoreId?: string | null,
  opts?: { force?: boolean },
): Promise<DuplicateHit> {
  const key = dupCacheKey(docKey, ignoreId);
  if (!opts?.force) {
    const cached = dupCache.get(key);
    if (cached && Date.now() - cached.at < DUP_CACHE_TTL_MS) return cached.value;
    const pending = dupInflight.get(key);
    if (pending) return pending;
  }

  const request = (async () => {
    const variants = Array.from(new Set([docKey, maskCpfCnpj(docKey)])).filter(Boolean);
    const { data } = await supabase
      .from("contacts")
      .select("id, name, document")
      .in("document", variants)
      .limit(20);
    const hit = (data ?? []).find(
      (c: any) => isSameDocumento(c.document, docKey) && c.id !== ignoreId,
    );
    const value: DuplicateHit = hit ? { id: (hit as any).id, name: (hit as any).name } : null;
    dupCache.set(key, { at: Date.now(), value });
    return value;
  })();

  dupInflight.set(key, request);
  try {
    return await request;
  } finally {
    dupInflight.delete(key);
  }
}



export function ContactFormDialog({
  open,
  onOpenChange,
  onSaved,
  editContact,
  defaultName,
  defaultContactType,
  defaultDocument,
  defaultCompanyIds,
  defaultVisiblePf,
}: Props) {
  const { user } = useAuth();
  const { companies } = useCompanyContext();
  const [name, setName] = useState("");
  const [contactType, setContactType] = useState<"cliente" | "fornecedor" | "ambos">("cliente");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const visiblePf = false;
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const cnpjLookup = useCnpjLookup();
  const cnpjLookupPending = cnpjLookup.isPending;

  useEffect(() => {
    if (editContact) {
      setName(editContact.name);
      setContactType(editContact.contact_type as "cliente" | "fornecedor" | "ambos");
      setEmail(editContact.email ?? "");
      setPhone(editContact.phone ?? "");
      setDocument(editContact.document ?? "");
      setAddress(editContact.address ?? "");
      setNotes(editContact.notes ?? "");
      // Load linked companies
      supabase
        .from("contact_companies" as any)
        .select("company_id")
        .eq("contact_id", editContact.id)
        .then(({ data }) => {
          setSelectedCompanyIds((data ?? []).map((r: any) => r.company_id));
        });
    } else {
      setName(defaultName ?? ""); setContactType(defaultContactType ?? "cliente"); setEmail(""); setPhone("");
      setDocument(defaultDocument ? maskCpfCnpj(defaultDocument) : ""); setAddress(""); setNotes("");
      setSelectedCompanyIds(defaultCompanyIds ?? []);
    }
    // `defaultCompanyIds` entra pela chave estável abaixo para não reabrir o efeito
    // a cada render do componente pai (o que apagaria o que o usuário digitou).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContact, open, defaultName, defaultContactType, defaultDocument, defaultVisiblePf, (defaultCompanyIds ?? []).join(",")]);

  // Bloqueio de duplicidade: procura outro contato com o mesmo CPF/CNPJ comparando a
  // chave normalizada (sem máscara, sem zeros perdidos), para evitar falsos negativos.
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const docDigitsLive = normalizeDocumento(document);
  useEffect(() => {
    if (docDigitsLive.length !== 11 && docDigitsLive.length !== 14) {
      setDuplicate(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const hit = await findDuplicateByDocument(docDigitsLive, editContact?.id);
      if (cancelled) return;
      setDuplicate(hit);
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [docDigitsLive, editContact?.id, open]);


  const toggleCompany = (id: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (cnpjLookupPending) {
      toast.error("Aguarde a consulta do CNPJ finalizar.");
      return;
    }

    if (!visiblePf && selectedCompanyIds.length === 0) {
      toast.error("Selecione pelo menos uma empresa.");
      return;
    }

    const docDigits = normalizeDocumento(document);
    if (docDigits.length > 0) {
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        toast.error("Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).");
        return;
      }
      if (docDigits.length === 11 && !isValidCpf(docDigits)) {
        toast.error("CPF inválido — dígitos verificadores incorretos.");
        return;
      }
      if (docDigits.length === 14 && !isValidCnpj(docDigits)) {
        toast.error("CNPJ inválido — dígitos verificadores incorretos.");
        return;
      }
      // Impede duplicidade por documento (confirma no banco, ignorando o cache).
      const dup = await findDuplicateByDocument(docDigits, editContact?.id, { force: true });
      if (dup) {
        setDuplicate(dup);
        toast.error("CPF/CNPJ já cadastrado", {
          description: `Já existe o contato "${dup.name}" com este documento. Selecione-o na lista em vez de criar outro.`,
        });
        return;
      }
    }


    const validated = validateWithToast(contactSchema, {
      name, contact_type: contactType,
      email: email || null, phone: phone || null,
      document: document || null, address: address || null,
      notes: notes || null,
    }, toast.error);
    if (!validated) return;

    setSaving(true);
    // O cadastro muda o resultado da checagem: descarta as respostas em cache.
    invalidateDuplicateCache();
    const payload = { ...validated, visible_pf: visiblePf };

    const duplicateMessage = "Já existe um cliente/fornecedor cadastrado com este CPF/CNPJ. Selecione o cadastro existente em vez de criar outro.";
    const isDuplicateError = (err: { code?: string; message?: string } | null) =>
      err?.code === "23505" || /contacts_user_document_key_uniq|duplicate key/i.test(err?.message ?? "");

    if (editContact) {
      const { error } = await supabase.from("contacts").update(payload as any).eq("id", editContact.id);
      if (error) {
        toast.error(isDuplicateError(error) ? "CPF/CNPJ já cadastrado" : "Erro ao atualizar", {
          description: isDuplicateError(error) ? duplicateMessage : error.message,
        });
        setSaving(false); return;
      }

      // Sync contact_companies
      await (supabase.from("contact_companies" as any) as any).delete().eq("contact_id", editContact.id);
      if (selectedCompanyIds.length > 0) {
        await supabase.from("contact_companies" as any).insert(
          selectedCompanyIds.map((cid) => ({ contact_id: editContact.id, company_id: cid })) as any
        );
      }
      await supabase.rpc("insert_audit_log", {
        _action: "contact_updated",
        _entity_type: "contact",
        _entity_id: editContact.id,
        _details: { target_name: name },
      });
      toast.success("Contato atualizado!"); onOpenChange(false); onSaved();
    } else {
      const { data: newContact, error } = await supabase.from("contacts").insert({ ...payload, user_id: user.id } as any).select("id").single();
      if (error || !newContact) {
        toast.error(isDuplicateError(error) ? "CPF/CNPJ já cadastrado" : "Erro ao criar", {
          description: isDuplicateError(error) ? duplicateMessage : error?.message,
        });
        setSaving(false); return;
      }

      if (selectedCompanyIds.length > 0) {
        await supabase.from("contact_companies" as any).insert(
          selectedCompanyIds.map((cid) => ({ contact_id: (newContact as any).id, company_id: cid })) as any
        );
      }
      await supabase.rpc("insert_audit_log", {
        _action: "contact_created",
        _entity_type: "contact",
        _entity_id: (newContact as any).id,
        _details: { target_name: name },
      });
      toast.success("Contato criado!"); onOpenChange(false); onSaved((newContact as any).id);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editContact ? "Editar Contato" : "Novo Contato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo ou razão social" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={contactType} onValueChange={(v) => setContactType(v as typeof contactType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              {(() => {
                const docDigits = document.replace(/\D/g, "");
                const isCnpj = docDigits.length > 11;
                const invalid =
                  (docDigits.length === 11 && !isValidCpf(docDigits)) ||
                  (docDigits.length === 14 && !isValidCnpj(docDigits));
                const canLookup = docDigits.length === 14 && isValidCnpj(docDigits) && !cnpjLookupPending;
                const runLookup = async () => {
                  if (!canLookup) return;
                  try {
                    const d = await cnpjLookup.mutateAsync(docDigits);
                    if (d.razao_social) setName(d.nome_fantasia || d.razao_social);
                    if (d.email && !email) setEmail(d.email);
                    if (d.telefone && !phone) setPhone(d.telefone);
                    if (d.endereco_formatado) setAddress(d.endereco_formatado);
                    notifyCnpjSuccess(d);
                  } catch (e) {
                    notifyCnpjError(e, { onRetry: () => { void runLookup(); } });
                  }
                };
                return (
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <Input
                        value={document}
                        onChange={(e) => setDocument(maskCpfCnpj(e.target.value))}
                        placeholder="CPF ou CNPJ"
                        maxLength={18}
                        inputMode="numeric"
                        disabled={cnpjLookupPending}
                        aria-invalid={invalid}
                        className={cn(invalid && "border-destructive focus-visible:ring-destructive")}
                      />
                      {isCnpj && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={runLookup}
                          disabled={!canLookup}
                          title="Buscar dados do CNPJ na Receita Federal"
                          aria-label="Buscar CNPJ"
                        >
                          {cnpjLookupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    {invalid && (
                      <p className="text-xs text-destructive">
                        {docDigits.length === 11 ? "CPF" : "CNPJ"} inválido — verifique os dígitos.
                      </p>
                    )}
                    {!invalid && duplicate && (
                      <p className="text-xs text-destructive">
                        Já existe o contato "{duplicate.name}" com este CPF/CNPJ — selecione-o na lista
                        em vez de cadastrar novamente.
                      </p>
                    )}

                    {cnpjLookupPending && (
                      <p className="text-xs text-muted-foreground">Consultando Receita Federal…</p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" maxLength={20} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereço</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, cidade" maxLength={200} />
            </div>

            {/* Vinculação */}
            <div className="space-y-3 sm:col-span-2">
              <Label>Vinculado a *</Label>
              <div className="space-y-2">
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedCompanyIds.includes(company.id)}
                      onCheckedChange={() => toggleCompany(company.id)}
                    />
                    <span className="text-sm">{company.trade_name || company.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotações sobre o contato..." rows={3} maxLength={500} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving || cnpjLookupPending}>
            {saving ? "Salvando..." : cnpjLookupPending ? "Consultando CNPJ..." : editContact ? "Atualizar" : "Criar Contato"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
