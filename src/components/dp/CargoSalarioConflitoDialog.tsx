import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { moedaBR } from "@/lib/dp/cargos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargoNome: string;
  salarioCargo: number;
  salarioInformado: number;
  /** Nome sugerido para a variação do cargo. */
  nomeSugerido: string;
  /** Cria a variação com o salário informado e vincula ao colaborador. */
  onCriarVariacao: (nome: string) => void;
  /** Ajusta o formulário para usar o salário do cargo. */
  onUsarSalarioDoCargo: () => void;
  saving?: boolean;
}

/**
 * Um cargo = um salário. Quando o salário informado no colaborador diverge do
 * salário de referência do cargo, o salvamento para aqui.
 */
export function CargoSalarioConflitoDialog({
  open, onOpenChange, cargoNome, salarioCargo, salarioInformado,
  nomeSugerido, onCriarVariacao, onUsarSalarioDoCargo, saving,
}: Props) {
  const [nome, setNome] = useState(nomeSugerido);

  useEffect(() => {
    if (open) setNome(nomeSugerido);
  }, [open, nomeSugerido]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            Salário diferente do cargo
          </DialogTitle>
          <DialogDescription>
            O cargo <strong className="text-foreground">{cargoNome}</strong> tem salário de referência de{" "}
            <strong className="text-foreground">{moedaBR(salarioCargo)}</strong>, mas você informou{" "}
            <strong className="text-foreground">{moedaBR(salarioInformado)}</strong>. Cada cargo tem um único
            salário — escolha como seguir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="variacao-nome">Criar variação do cargo</Label>
            <Input id="variacao-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Cria o cargo com {moedaBR(salarioInformado)} e já vincula ao colaborador.
            </p>
            <Button
              className="w-full"
              disabled={saving || !nome.trim()}
              onClick={() => onCriarVariacao(nome.trim())}
            >
              Criar “{nome.trim() || "novo cargo"}”
            </Button>
          </div>

          <Button variant="outline" className="w-full" disabled={saving} onClick={onUsarSalarioDoCargo}>
            Usar o salário do cargo ({moedaBR(salarioCargo)})
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Revisar depois</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
