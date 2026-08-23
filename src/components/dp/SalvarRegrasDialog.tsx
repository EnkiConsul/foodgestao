import { useEffect, useState } from "react";
import { Save, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface UnidadeAlvo {
  id: string;
  nome: string;
  configurada: boolean;
}

/**
 * Confirmação de salvamento das regras de folgas.
 * A replicação para outras unidades só é oferecida aqui, no momento de salvar.
 */
export function SalvarRegrasDialog({
  open,
  onOpenChange,
  unidadeNome,
  outrasUnidades,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidadeNome: string;
  outrasUnidades: UnidadeAlvo[];
  saving?: boolean;
  onConfirm: (extras: string[]) => void;
}) {
  const [extras, setExtras] = useState<string[]>([]);

  useEffect(() => {
    if (open) setExtras([]);
  }, [open]);

  const toggle = (id: string, marcado: boolean) =>
    setExtras((prev) => (marcado ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Salvar Regras De Folgas</DialogTitle>
          <DialogDescription>
            As regras serão gravadas em <strong>{unidadeNome}</strong>.
            {outrasUnidades.length > 0 && " Se quiser, aplique a mesma regra em outras unidades."}
          </DialogDescription>
        </DialogHeader>

        {outrasUnidades.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Aplicar também em</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtras(outrasUnidades.map((u) => u.id))}
                >
                  Selecionar todas
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExtras([])}
                  disabled={extras.length === 0}
                >
                  Limpar
                </Button>
              </div>
            </div>
            <ScrollArea className="max-h-56 rounded-md border">
              <div className="grid gap-2 p-2 sm:grid-cols-2">
                {outrasUnidades.map((u) => (
                  <label
                    key={u.id}
                    htmlFor={`salvar-alvo-${u.id}`}
                    className="flex items-start gap-2 rounded-md border p-2 text-sm"
                  >
                    <Checkbox
                      id={`salvar-alvo-${u.id}`}
                      checked={extras.includes(u.id)}
                      onCheckedChange={(c) => toggle(u.id, c === true)}
                    />
                    <span className="leading-tight">
                      {u.nome}
                      {!u.configurada && (
                        <span className="block text-xs text-muted-foreground">ainda não configurada</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Store className="h-3.5 w-3.5" aria-hidden="true" />
          {extras.length > 0
            ? `Será salvo em ${extras.length + 1} unidades.`
            : `Será salvo apenas em ${unidadeNome}.`}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="gap-2" onClick={() => onConfirm(extras)} disabled={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Confirmar E Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
