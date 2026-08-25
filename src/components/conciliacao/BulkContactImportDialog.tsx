import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, UserPlus } from "lucide-react";
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
import { toProperName } from "@/lib/text/properName";

export interface BulkContactCandidate {
  key: string;
  name: string;
  document: string | null;
  type: "cliente" | "fornecedor" | "ambos";
  rowIds: string[];
  similarName?: string | null;
}

const TYPE_LABELS: Record<BulkContactCandidate["type"], string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Ambos",
};

export function BulkContactImportDialog({
  open,
  onOpenChange,
  candidates,
  onCreate,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: BulkContactCandidate[];
  onCreate: (keys: string[]) => void;
  busy?: boolean;
}) {
  const defaultChecked = useMemo(
    () => new Set(candidates.filter((c) => !c.similarName).map((c) => c.key)),
    [candidates],
  );
  const [checked, setChecked] = useState<Set<string>>(defaultChecked);

  useEffect(() => {
    if (open) setChecked(defaultChecked);
  }, [defaultChecked, open]);

  const selectedCount = checked.size;
  const allChecked = candidates.length > 0 && candidates.every((c) => checked.has(c.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Cadastro em massa de fornecedores/clientes
          </DialogTitle>
          <DialogDescription>
            Revise os nomes e CPF/CNPJ identificados no extrato antes de criar os cadastros.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            Não há novos fornecedores/clientes identificados nos lançamentos filtrados.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <label className="flex items-center gap-2 font-medium">
                <Checkbox
                  checked={allChecked ? true : selectedCount > 0 ? "indeterminate" : false}
                  disabled={busy}
                  onCheckedChange={(value) => {
                    setChecked(value ? new Set(candidates.map((c) => c.key)) : new Set());
                  }}
                />
                Selecionar todos
              </label>
              <span className="text-muted-foreground">
                {selectedCount} de {candidates.length} selecionado(s)
              </span>
            </div>

            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 p-2 text-left"> </th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">CPF/CNPJ</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-right">Linhas</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.key} className="border-t">
                      <td className="p-2 align-top">
                        <Checkbox
                          checked={checked.has(c.key)}
                          disabled={busy}
                          onCheckedChange={(value) => {
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (value) next.add(c.key);
                              else next.delete(c.key);
                              return next;
                            });
                          }}
                          aria-label={`Selecionar ${c.name}`}
                        />
                      </td>
                      <td className="max-w-[260px] p-2 align-top">
                        <p className="font-medium">{toProperName(c.name)}</p>
                        {c.similarName && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            parecido com {toProperName(c.similarName)}
                          </p>
                        )}
                      </td>
                      <td className="p-2 align-top text-xs text-muted-foreground">{c.document ?? "—"}</td>
                      <td className="p-2 align-top">
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABELS[c.type]}
                        </Badge>
                      </td>
                      <td className="p-2 text-right align-top tabular-nums">{c.rowIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => onCreate(Array.from(checked))} disabled={busy || selectedCount === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Criar selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}