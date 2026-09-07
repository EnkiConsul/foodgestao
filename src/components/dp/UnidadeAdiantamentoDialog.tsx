import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpsertDpUnidade, type DpUnidade } from "@/hooks/useDpCadastros";

interface Props { unidade: DpUnidade | null; open: boolean; onOpenChange: (open: boolean) => void; }

export function UnidadeAdiantamentoDialog({ unidade, open, onOpenChange }: Props) {
  const salvar = useUpsertDpUnidade();
  const [ativo, setAtivo] = useState(false);
  const [dia, setDia] = useState(15);

  useEffect(() => {
    if (!open || !unidade) return;
    setAtivo(unidade.tem_adiantamento);
    setDia(unidade.dia_adiantamento ?? 15);
  }, [open, unidade]);

  const concluir = async () => {
    if (!unidade) return;
    if (ativo && (dia < 1 || dia > 28)) { toast.error("Informe um dia entre 1 e 28"); return; }
    try {
      await salvar.mutateAsync({
        id: unidade.id, nome: unidade.nome, company_id: unidade.company_id,
        tem_adiantamento: ativo, dia_adiantamento: ativo ? dia : null,
      });
      toast.success("Regra de adiantamento atualizada");
      onOpenChange(false);
    } catch (error) {
      toast.error("Não foi possível atualizar a unidade", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Adiantamento da unidade</DialogTitle>
        <DialogDescription>{unidade?.nome}: esta regra será sugerida aos colaboradores da unidade.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <Label htmlFor="unidade-tem-adiantamento">Oferece adiantamento salarial</Label>
          <Switch id="unidade-tem-adiantamento" checked={ativo} onCheckedChange={setAtivo} />
        </div>
        {ativo && <div className="space-y-2">
          <Label htmlFor="unidade-dia-adiantamento">Dia do adiantamento</Label>
          <Input id="unidade-dia-adiantamento" type="number" min={1} max={28} value={dia} onChange={(e) => setDia(Number(e.target.value))} />
        </div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button disabled={salvar.isPending} onClick={() => void concluir()}>{salvar.isPending ? "Salvando..." : "Salvar regra"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}