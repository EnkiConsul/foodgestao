import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toProperName } from "@/lib/text/properName";
import { MAX_IMPORT_ROWS, parseContactsSheet, type ContactImportType } from "@/lib/contacts/importSheet";
import { classifyImportRows, type ClassifiedImportRow, type ExistingContact } from "@/lib/contacts/importDedupe";
import { downloadContactsTemplate } from "@/lib/contacts/importTemplate";

const STATUS_LABEL: Record<ClassifiedImportRow["status"], string> = {
  novo: "Novo",
  existente: "Já cadastrado",
  duplicado_planilha: "Duplicado na planilha",
  erro: "Erro",
};

const STATUS_VARIANT: Record<ClassifiedImportRow["status"], "default" | "secondary" | "outline" | "destructive"> = {
  novo: "default",
  existente: "secondary",
  duplicado_planilha: "outline",
  erro: "destructive",
};

const TYPE_LABEL: Record<ContactImportType, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Ambos",
};

export function ContactImportDialog({
  open,
  onOpenChange,
  existingContacts,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingContacts: ExistingContact[];
  onImported: () => void;
}) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ClassifiedImportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFileName(null);
    setRows(null);
    setSelected(new Set());
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const parsed = await parseContactsSheet(file);
      if (parsed.length === 0) {
        toast.error("Nenhuma linha encontrada na planilha");
        return;
      }
      const classified = classifyImportRows(parsed, existingContacts);
      setRows(classified);
      setSelected(new Set(classified.filter((r) => r.status === "novo").map((r) => r.rowNumber)));
      setFileName(file.name);
      if (parsed.length >= MAX_IMPORT_ROWS) {
        toast.warning(`Lemos apenas as primeiras ${MAX_IMPORT_ROWS} linhas do arquivo`);
      }
    } catch (e) {
      toast.error("Não foi possível ler a planilha", { description: (e as Error).message });
    } finally {
      setParsing(false);
    }
  };

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      criar: list.filter((r) => selected.has(r.rowNumber) && r.status !== "erro").length,
      ignorados: list.filter((r) => !selected.has(r.rowNumber) && r.status !== "erro").length,
      erros: list.filter((r) => r.status === "erro").length,
    };
  }, [rows, selected]);

  const setRowType = (rowNumber: number, type: ContactImportType) => {
    setRows((prev) => prev?.map((r) => (r.rowNumber === rowNumber ? { ...r, contact_type: type } : r)) ?? prev);
  };

  const setAllTypes = (type: ContactImportType) => {
    setRows((prev) => prev?.map((r) => (selected.has(r.rowNumber) ? { ...r, contact_type: type } : r)) ?? prev);
  };

  const handleImport = async () => {
    if (!user || !rows) return;
    const toCreate = rows.filter((r) => selected.has(r.rowNumber) && r.status !== "erro");
    if (toCreate.length === 0) return;

    const companyId = contextType === "pj" ? selectedCompanyId : null;
    setSaving(true);
    let created = 0;
    let failed = 0;

    for (let i = 0; i < toCreate.length; i += 100) {
      const chunk = toCreate.slice(i, i + 100);
      const payload = chunk.map((r) => ({
        user_id: user.id,
        name: r.name,
        contact_type: r.contact_type,
        document: r.document,
        email: r.email,
        phone: r.phone,
        address: r.address,
        notes: r.notes,
        visible_pf: !companyId,
      }));

      const { data, error } = await supabase.from("contacts").insert(payload as any).select("id");
      if (error || !data) {
        // Lote pode falhar por documento duplicado; tenta linha a linha.
        for (const single of payload) {
          const { data: one, error: oneErr } = await supabase
            .from("contacts")
            .insert(single as any)
            .select("id")
            .single();
          if (oneErr || !one) { failed++; continue; }
          created++;
          if (companyId) {
            await supabase.from("contact_companies" as any).insert({ contact_id: (one as any).id, company_id: companyId } as any);
          }
        }
        continue;
      }

      created += data.length;
      if (companyId) {
        await supabase.from("contact_companies" as any).insert(
          (data as { id: string }[]).map((c) => ({ contact_id: c.id, company_id: companyId })) as any,
        );
      }
    }

    if (created > 0) {
      await supabase.rpc("insert_audit_log", {
        _action: "contacts_imported",
        _entity_type: "contact",
        _entity_id: null as any,
        _details: { count: created, failed, file: fileName ?? "planilha" },
      });
    }

    setSaving(false);
    if (created > 0) {
      toast.success(`${created} contato(s) importado(s)`, {
        description: failed > 0 ? `${failed} não pôde(ram) ser criado(s) (possível CPF/CNPJ duplicado).` : undefined,
      });
      onImported();
      reset();
      onOpenChange(false);
    } else {
      toast.error("Nenhum contato foi importado", {
        description: "Verifique se os CPF/CNPJ já estão cadastrados.",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Importar clientes/fornecedores
          </DialogTitle>
          <DialogDescription>
            Envie uma planilha Excel (.xlsx) ou CSV. Revise as linhas antes de cadastrar.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <Button variant="outline" size="sm" onClick={() => downloadContactsTemplate()}>
              <Download className="mr-2 h-4 w-4" /> Baixar modelo (.xlsx)
            </Button>

            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground hover:bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              <span>{parsing ? "Lendo planilha..." : "Arraste o arquivo aqui ou clique para selecionar"}</span>
              <span className="text-xs">Colunas: nome, tipo, cpf_cnpj, email, telefone, endereco, observacoes</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <span className="truncate font-medium">{fileName}</span>
              <span className="text-muted-foreground">
                {counts.criar} serão criados · {counts.ignorados} ignorados · {counts.erros} com erro
              </span>
              <div className="flex items-center gap-2">
                <Select onValueChange={(v) => setAllTypes(v as ContactImportType)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue placeholder="Aplicar tipo aos marcados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fornecedor">Fornecedor</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                  Trocar arquivo
                </Button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 p-2 text-left">
                      <Checkbox
                        checked={
                          rows.every((r) => r.status === "erro" || selected.has(r.rowNumber))
                            ? true
                            : selected.size > 0
                              ? "indeterminate"
                              : false
                        }
                        disabled={saving}
                        onCheckedChange={(v) =>
                          setSelected(v ? new Set(rows.filter((r) => r.status !== "erro").map((r) => r.rowNumber)) : new Set())
                        }
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">CPF/CNPJ</th>
                    <th className="p-2 text-left">Contato</th>
                    <th className="p-2 text-left">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className="border-t align-top">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(r.rowNumber)}
                          disabled={saving || r.status === "erro"}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(r.rowNumber);
                              else next.delete(r.rowNumber);
                              return next;
                            })
                          }
                          aria-label={`Selecionar linha ${r.rowNumber}`}
                        />
                      </td>
                      <td className="max-w-[240px] p-2">
                        <p className="font-medium">{r.name ? toProperName(r.name) : "—"}</p>
                        <p className="text-xs text-muted-foreground">linha {r.rowNumber}</p>
                        {r.errors.length > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" /> {r.errors.join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="p-2">
                        <Select
                          value={r.contact_type}
                          onValueChange={(v) => setRowType(r.rowNumber, v as ContactImportType)}
                          disabled={saving}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fornecedor">{TYPE_LABEL.fornecedor}</SelectItem>
                            <SelectItem value="cliente">{TYPE_LABEL.cliente}</SelectItem>
                            <SelectItem value="ambos">{TYPE_LABEL.ambos}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{r.document ?? "—"}</td>
                      <td className="max-w-[200px] p-2 text-xs text-muted-foreground">
                        <p className="truncate">{r.email ?? "—"}</p>
                        <p className="truncate">{r.phone ?? ""}</p>
                      </td>
                      <td className="p-2">
                        <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                          {STATUS_LABEL[r.status]}
                        </Badge>
                        {r.matchName && (
                          <p className="mt-1 text-[10px] text-muted-foreground">{toProperName(r.matchName)}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={saving || !rows || counts.criar === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Cadastrar {counts.criar > 0 ? `${counts.criar} contato(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
