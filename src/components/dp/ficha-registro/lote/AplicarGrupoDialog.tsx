import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { EscolhasLote } from "@/lib/dp/ficha-registro/organizacao-lote";
import { EscolhasLoteCampos, type TurnoLote } from "./EscolhasLoteCampos";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Quantas fichas recebem a escolha e de onde (ex.: "do setor Salão"). */
  quantidade: number;
  origem: string;
  turnos: TurnoLote[];
  salvando: boolean;
  onAplicar: (e: EscolhasLote) => Promise<void>;
}

/** Ação em grupo: aplica só o que for escolhido às fichas selecionadas; o resto fica como está. */
export function AplicarGrupoDialog({ open, onOpenChange, quantidade, origem, turnos, salvando, onAplicar }: Props) {
  const [escolhas, setEscolhas] = useState<EscolhasLote>({});
  useEffect(() => { if (open) setEscolhas({}); }, [open]);
  const nada = Object.keys(escolhas).length === 0;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Aplicar a ${quantidade} ${quantidade === 1 ? "ficha" : "fichas"}`}
      description={`${origem}. Só muda o que você escolher; o restante de cada ficha fica como está.`}
      className="sm:max-w-lg"
      footer={
        <div className="flex w-full gap-2 sm:justify-end">
          <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="h-11 flex-1 sm:flex-none"
            disabled={nada || salvando}
            onClick={async () => {
              try {
                await onAplicar(escolhas);
                onOpenChange(false);
              } catch {
                /* a mensagem já foi mostrada */
              }
            }}
          >
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar
          </Button>
        </div>
      }
    >
      <EscolhasLoteCampos valor={escolhas} onChange={setEscolhas} modo="grupo" turnos={turnos} />
    </ResponsiveDialog>
  );
}
