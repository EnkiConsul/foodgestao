/**
 * Escolhe para quais cargos e unidades um documento é exigido.
 *
 * Sem nenhuma marcação, a exigência vale para toda a empresa. Os nomes vêm dos
 * cadastros de Cargos e Unidades — nada é comparado por texto digitado.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notifyError } from "@/lib/notifyError";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpRequisitoEscopo } from "@/hooks/dp/useDpRequisitoEscopo";

interface Props {
  requisitoId: string | null;
  requisitoNome: string;
  onOpenChange: (open: boolean) => void;
}

export function RequisitoEscopoDialog({ requisitoId, requisitoNome, onOpenChange }: Props) {
  const { escopo, salvar } = useDpRequisitoEscopo(requisitoId);
  const { data: cargos = [] } = useDpCargos();
  const { data: unidades = [] } = useDpUnidades();
  const [cargosSel, setCargosSel] = useState<string[]>([]);
  const [unidadesSel, setUnidadesSel] = useState<string[]>([]);

  useEffect(() => {
    setCargosSel(escopo.data?.cargos ?? []);
    setUnidadesSel(escopo.data?.unidades ?? []);
  }, [escopo.data]);

  const alternar = (lista: string[], id: string) =>
    lista.includes(id) ? lista.filter((i) => i !== id) : [...lista, id];

  const gravar = async () => {
    try {
      await salvar.mutateAsync({ cargos: cargosSel, unidades: unidadesSel });
      toast.success("Exigência atualizada");
      onOpenChange(false);
    } catch (e) {
      notifyError(e as Error, { surface: "Pessoas 360°", action: "salvar cargos e unidades" });
    }
  };

  return (
    <Dialog open={!!requisitoId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Onde Exigir: {requisitoNome}</DialogTitle>
          <DialogDescription>
            Marque os cargos e as unidades que precisam entregar este documento. Sem nenhuma marcação, ele é
            exigido de toda a empresa.
          </DialogDescription>
        </DialogHeader>
        {escopo.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Cargos</p>
              <ScrollArea className="h-56 rounded-md border p-2">
                {cargos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum cargo cadastrado.</p>
                ) : (
                  cargos.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                      <Checkbox
                        checked={cargosSel.includes(c.id)}
                        onCheckedChange={() => setCargosSel((l) => alternar(l, c.id))}
                        aria-label={`Exigir no cargo ${c.nome}`}
                      />
                      <span className="truncate">{c.nome}</span>
                    </label>
                  ))
                )}
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Unidades</p>
              <ScrollArea className="h-56 rounded-md border p-2">
                {unidades.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada.</p>
                ) : (
                  unidades.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 py-1 text-sm">
                      <Checkbox
                        checked={unidadesSel.includes(u.id)}
                        onCheckedChange={() => setUnidadesSel((l) => alternar(l, u.id))}
                        aria-label={`Exigir na unidade ${u.nome}`}
                      />
                      <span className="truncate">{u.nome}</span>
                    </label>
                  ))
                )}
              </ScrollArea>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={salvar.isPending} onClick={gravar}>
            {salvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
        <Label className="sr-only">Cargos e unidades onde o documento é exigido</Label>
      </DialogContent>
    </Dialog>
  );
}
