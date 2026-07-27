import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarBRL, totaisDosExtras, type RubricaExtra } from "@/lib/dp/folha";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  extras: RubricaExtra[];
  isPending: boolean;
  onConfirm: (extras: RubricaExtra[]) => void;
}

const vazia = (): RubricaExtra => ({ descricao: "", natureza: "provento", valor: 0 });

/** Fase 16 — proventos e descontos avulsos de um lançamento da folha. */
export function FolhaRubricasDialog({ open, onOpenChange, nome, extras, isPending, onConfirm }: Props) {
  const [linhas, setLinhas] = useState<RubricaExtra[]>(extras);

  useEffect(() => {
    if (open) setLinhas(extras.length ? extras : [vazia()]);
  }, [open, extras]);

  const atualizar = (i: number, patch: Partial<RubricaExtra>) =>
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const validas = linhas.filter((l) => l.descricao.trim() && l.valor > 0);
  const totais = totaisDosExtras(validas);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rubricas Avulsas</DialogTitle>
          <DialogDescription>
            Proventos e descontos manuais de {nome} nesta competência (adiantamento, prêmio, vale, empréstimo).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor={`rubrica-desc-${i}`} className="text-xs">Descrição</Label>
                <Input
                  id={`rubrica-desc-${i}`}
                  value={l.descricao}
                  placeholder="Ex.: Adiantamento"
                  onChange={(e) => atualizar(i, { descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Natureza</Label>
                <Select
                  value={l.natureza}
                  onValueChange={(v) => atualizar(i, { natureza: v as RubricaExtra["natureza"] })}
                >
                  <SelectTrigger className="w-full sm:w-[130px]" aria-label="Natureza da rubrica">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="provento">Provento</SelectItem>
                    <SelectItem value="desconto">Desconto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`rubrica-valor-${i}`} className="text-xs">Valor</Label>
                <Input
                  id={`rubrica-valor-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full sm:w-[110px]"
                  value={l.valor || ""}
                  onChange={(e) => atualizar(i, { valor: Number(e.target.value) || 0 })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover rubrica ${i + 1}`}
                onClick={() => setLinhas((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={() => setLinhas((prev) => [...prev, vazia()])}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Rubrica
          </Button>

          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>Proventos avulsos: <strong>{formatarBRL(totais.proventos)}</strong></p>
            <p>Descontos avulsos: <strong>{formatarBRL(totais.descontos)}</strong></p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={isPending} onClick={() => onConfirm(validas)}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Rubricas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
