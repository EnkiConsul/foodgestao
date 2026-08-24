import { AlertTriangle, Pencil, UserPlus, Link2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toProperName } from "@/lib/text/properName";
import type { SimilarContact } from "@/lib/conciliacao/contacts";

const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  ambos: "Ambos",
};

const REASON_LABELS: Record<SimilarContact["reason"], string> = {
  documento: "mesmo CPF/CNPJ",
  nome: "mesmo nome",
  parecido: "nome parecido",
};

/**
 * Confirmação antes de cadastrar um fornecedor/cliente na conciliação quando já
 * existem cadastros iguais ou parecidos. Só apresenta e devolve a escolha —
 * toda a persistência fica na página.
 */
export function ContactDuplicateDialog({
  open,
  onOpenChange,
  statementName,
  statementDocument,
  candidates,
  onUseExisting,
  onEditExisting,
  onCreateAnyway,
  busyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementName: string;
  statementDocument: string | null;
  candidates: SimilarContact[];
  onUseExisting: (contact: SimilarContact) => void;
  onEditExisting: (contact: SimilarContact) => void;
  onCreateAnyway: () => void;
  busyId?: string | null;
}) {
  const hasSameDocument = candidates.some((c) => c.reason === "documento");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Possível cadastro duplicado
          </DialogTitle>
          <DialogDescription>
            Já existe cadastro igual ou parecido com o que o extrato trouxe. Escolha o que fazer.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-xs">
          <p className="font-medium text-foreground">Do extrato</p>
          <p className="mt-1 text-muted-foreground">
            {statementName ? toProperName(statementName) : "sem nome identificado"}
            {statementDocument ? ` · ${statementDocument}` : ""}
          </p>
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{toProperName(c.name)}</span>
                {c.contact_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {TYPE_LABELS[c.contact_type] ?? c.contact_type}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    c.reason === "documento"
                      ? "border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
                      : "text-[10px]"
                  }
                >
                  {REASON_LABELS[c.reason]}
                </Badge>
              </div>
              {c.document && (
                <p className="mt-1 text-xs text-muted-foreground">{c.document}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!!busyId}
                  onClick={() => onUseExisting(c)}
                >
                  <Link2 className="mr-1 h-3 w-3" />
                  Usar este cadastro
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!!busyId}
                  onClick={() => onEditExisting(c)}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Abrir cadastro
                </Button>
              </div>
            </div>
          ))}
        </div>

        {hasSameDocument && (
          <p className="text-xs text-destructive">
            Existe cadastro com o mesmo CPF/CNPJ — não é possível criar outro.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busyId}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={onCreateAnyway}
            disabled={hasSameDocument || !!busyId}
          >
            <UserPlus className="mr-1 h-4 w-4" />
            Cadastrar novo mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
