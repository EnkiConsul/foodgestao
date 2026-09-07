import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsertDpCargo } from "@/hooks/useDpCadastros";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Cargo como veio escrito na ficha. */
  cargoNome: string;
  cbo?: string | null;
  /** Devolve o cargo criado para ser usado na ficha. */
  onCriado: (cargoId: string) => void;
}

/**
 * Confirmação para criar um cargo que não existe no cadastro. Cada ficha decide
 * o seu cargo — nada é criado automaticamente nem aplicado em lote.
 */
export function CargoCorrespondenciaDialog({ open, onOpenChange, cargoNome, cbo, onCriado }: Props) {
  const [nome, setNome] = useState(cargoNome);
  const [codigo, setCodigo] = useState(cbo ?? "");
  const upsert = useUpsertDpCargo();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar cargo da ficha</DialogTitle>
          <DialogDescription>
            A ficha traz “{cargoNome}”, que ainda não existe no cadastro de cargos desta empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome do cargo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Código CBO (opcional)</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={upsert.isPending || !nome.trim()}
            onClick={() =>
              upsert.mutate(
                { nome: nome.trim(), cbo: codigo.trim() || null },
                {
                  onSuccess: (cargo) => {
                    toast.success("Cargo criado");
                    onCriado((cargo as { id: string }).id);
                    onOpenChange(false);
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          >
            {upsert.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Criar cargo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
