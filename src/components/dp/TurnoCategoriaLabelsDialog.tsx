import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tags, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CATEGORIAS_TURNO, type CategoriaLabels } from "@/lib/dp/turno-utils";
import { useTurnoCategoriaLabels } from "@/hooks/useTurnoCategoriaLabels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Permite renomear as categorias de turno por empresa (ex.: "Almoço" → "Rodízio").
 * Os códigos internos não mudam, então turnos já cadastrados continuam válidos.
 */
export function TurnoCategoriaLabelsDialog({ open, onOpenChange }: Props) {
  const { labels, salvar } = useTurnoCategoriaLabels();
  const [valores, setValores] = useState<CategoriaLabels>({});

  useEffect(() => {
    if (!open) return;
    const next: CategoriaLabels = {};
    CATEGORIAS_TURNO.forEach((c) => { next[c.v] = labels[c.v] ?? c.label; });
    setValores(next);
  }, [open, labels]);

  const gravar = async () => {
    try {
      await salvar.mutateAsync(valores);
      toast.success("Nomes das categorias atualizados");
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível salvar os nomes", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" aria-hidden="true" />
            Nomes das categorias de turno
          </DialogTitle>
          <DialogDescription>
            Use a linguagem da sua operação. Os turnos já cadastrados continuam válidos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {CATEGORIAS_TURNO.map((c) => (
            <div key={c.v} className="space-y-1.5">
              <Label htmlFor={`cat-${c.v}`} className="text-xs text-muted-foreground">
                {c.label}
              </Label>
              <Input
                id={`cat-${c.v}`}
                value={valores[c.v] ?? ""}
                placeholder={c.label}
                onChange={(e) => setValores((v) => ({ ...v, [c.v]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const next: CategoriaLabels = {};
              CATEGORIAS_TURNO.forEach((c) => { next[c.v] = c.label; });
              setValores(next);
            }}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" /> Restaurar padrão
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
