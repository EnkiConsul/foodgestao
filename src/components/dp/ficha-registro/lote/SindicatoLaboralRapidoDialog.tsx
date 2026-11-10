import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsertDpSindicato } from "@/hooks/useDpCadastros";
import { dataBaseIso, mascaraDataBase } from "@/lib/dp/sindicato-data-base";
import { notifyError } from "@/lib/notifyError";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Devolve o sindicato criado para já escolhê-lo no lote. */
  onCreated: (id: string) => void;
}

/**
 * Cadastro rápido do sindicato da categoria (laboral) sem sair da importação.
 * O vínculo com os cargos é feito ao salvar a etapa de cargos do lote; contato
 * e CNPJ ficam para o cadastro completo de sindicatos.
 */
export function SindicatoLaboralRapidoDialog({ open, onOpenChange, onCreated }: Props) {
  const upsert = useUpsertDpSindicato();
  const [nome, setNome] = useState("");
  const [dataBase, setDataBase] = useState("");

  useEffect(() => {
    if (open) {
      setNome("");
      setDataBase("");
    }
  }, [open]);

  const dataInvalida = !!dataBase && !dataBaseIso(dataBase);

  const salvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do sindicato");
      return;
    }
    if (dataInvalida) {
      toast.error("Informe a data-base como dia/mês, ex.: 01/05");
      return;
    }
    try {
      const id = await upsert.mutateAsync({
        nome: nome.trim(),
        tipo: "laboral",
        data_base: dataBase ? dataBaseIso(dataBase) : null,
      } as Parameters<typeof upsert.mutateAsync>[0]);
      toast.success("Sindicato cadastrado. Os cargos do lote ficam vinculados a ele ao salvar a próxima etapa.");
      onCreated(id);
      onOpenChange(false);
    } catch (e) {
      notifyError(e as Error, { surface: "Importar ficha de registro", action: "cadastrar o sindicato" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo sindicato da categoria</DialogTitle>
          <DialogDescription>
            Sindicato dos empregados (laboral). Contatos e CNPJ podem ser completados depois no cadastro de sindicatos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sind-rapido-nome">Nome *</Label>
            <Input
              id="sind-rapido-nome"
              className="h-11"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: SINDICATO DOS EMPREGADOS EM HOTÉIS E RESTAURANTES"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sind-rapido-data">Data-base (dia/mês)</Label>
            <Input
              id="sind-rapido-data"
              className="h-11"
              inputMode="numeric"
              placeholder="01/05"
              value={dataBase}
              onChange={(e) => setDataBase(mascaraDataBase(e.target.value))}
              aria-invalid={dataInvalida}
            />
            <p className={dataInvalida ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {dataInvalida
                ? "Data inválida. Use dia/mês, ex.: 01/05."
                : "Mês do reajuste da convenção. Cada restaurante pode alterar depois."}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-11" onClick={salvar} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar sindicato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
