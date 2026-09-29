import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsertDpUnidade } from "@/hooks/useDpCadastros";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { digitsCnpj, formatCnpj } from "@/lib/dp/ficha-registro/unidade-match";
import { notifyError } from "@/lib/notifyError";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Empregador e CNPJ como vieram escritos na ficha. */
  nome: string;
  cnpj: string | null;
  onCriada: (unidadeId: string) => void;
}

/** Cria a unidade a partir do empregador lido na ficha, com confirmação. */
export function UnidadeCorrespondenciaDialog({ open, onOpenChange, nome: nomeLido, cnpj: cnpjLido, onCriada }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const [nome, setNome] = useState(nomeLido);
  const [cnpj, setCnpj] = useState(cnpjLido ? formatCnpj(cnpjLido) : "");
  const upsert = useUpsertDpUnidade();
  const cnpjDigits = digitsCnpj(cnpj);
  const cnpjValido = cnpjDigits.length === 0 || cnpjDigits.length === 14;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar unidade da ficha</DialogTitle>
          <DialogDescription>
            Os dados abaixo foram lidos da ficha. Confira antes de criar a unidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome da unidade</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CNPJ</Label>
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            {!cnpjValido && <p className="text-[11px] text-destructive">O CNPJ precisa ter 14 números.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={upsert.isPending || !nome.trim() || !cnpjValido || !selectedCompanyId}
            onClick={() =>
              upsert.mutate(
                { company_id: selectedCompanyId!, nome: nome.trim(), cnpj: cnpjDigits || null, ativo: true },
                {
                  onSuccess: (u) => {
                    toast.success("Unidade criada");
                    onCriada(u.id);
                    onOpenChange(false);
                  },
                  onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "criar a unidade" }),
                },
              )
            }
          >
            {upsert.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Criar unidade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
