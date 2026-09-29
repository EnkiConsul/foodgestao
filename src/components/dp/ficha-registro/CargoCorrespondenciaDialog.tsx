import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsertDpCargo, useUpsertDpCargoSalario } from "@/hooks/useDpCadastros";
import { useSindicatoDoCargo } from "@/hooks/useSindicatoDoCargo";
import { notifyError } from "@/lib/notifyError";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Cargo como veio escrito na ficha. */
  cargoNome: string;
  cbo?: string | null;
  /** Unidade escolhida nesta ficha: define o sindicato patronal e o piso. */
  unidadeId?: string | null;
  unidadeNome?: string | null;
  /** Devolve o cargo criado para ser usado na ficha. */
  onCriado: (cargoId: string) => void;
}

/**
 * Confirmação para criar um cargo que não existe no cadastro. Cada ficha decide
 * o seu cargo — nada é criado automaticamente nem aplicado em lote.
 *
 * O piso é opcional aqui, mas o aviso não: cargo criado sem piso entra na folha
 * sem parâmetro de sindicato, e é isso que o operador precisa saber na hora.
 */
export function CargoCorrespondenciaDialog({
  open, onOpenChange, cargoNome, cbo, unidadeId = null, unidadeNome = null, onCriado,
}: Props) {
  const [nome, setNome] = useState(cargoNome);
  const [codigo, setCodigo] = useState(cbo ?? "");
  const [piso, setPiso] = useState("");
  const upsert = useUpsertDpCargo();
  const upsertPiso = useUpsertDpCargoSalario();
  const sindicato = useSindicatoDoCargo(null, unidadeId);
  const patronal = sindicato.data?.patronal ?? null;

  const pisoValor = Number(piso.replace(/\./g, "").replace(",", "."));
  const pisoInformado = piso.trim().length > 0;
  const pisoValido = !pisoInformado || (Number.isFinite(pisoValor) && pisoValor > 0);

  const criar = () =>
    upsert.mutate(
      { nome: nome.trim(), cbo: codigo.trim() || null },
      {
        onSuccess: async (cargo) => {
          const cargoId = (cargo as { id: string }).id;
          if (pisoInformado && pisoValido) {
            try {
              await upsertPiso.mutateAsync({
                cargo_id: cargoId,
                salario_base: pisoValor,
                vigencia_inicio: new Date().toISOString().slice(0, 10),
                sindicato_patronal_id: patronal?.id ?? null,
                unidade_id: patronal?.id ? null : unidadeId,
              });
              toast.success("Cargo criado com o piso salarial registrado.");
            } catch (e) {
              toast.error(
                `Cargo criado, mas o piso salarial não foi salvo: ${(e as Error).message}. Defina o piso em Cadastros → Cargos.`,
              );
            }
          } else {
            toast.success("Cargo criado");
          }
          onCriado(cargoId);
          onOpenChange(false);
        },
        onError: (e: Error) => notifyError(e, { surface: "Pessoas 360°", action: "concluir a ação" }),
      },
    );

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
          <div className="space-y-1">
            <Label className="text-xs">Piso salarial (opcional)</Label>
            <Input
              value={piso}
              onChange={(e) => setPiso(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
            {!pisoValido && <p className="text-[11px] text-destructive">Informe um valor maior que zero.</p>}
            <p className="text-[11px] text-muted-foreground">
              {patronal
                ? `Vale para as unidades do sindicato ${patronal.nome}${unidadeNome ? ` (unidade ${unidadeNome})` : ""}.`
                : unidadeNome
                  ? `Vale para a unidade ${unidadeNome}. Esta unidade ainda não tem sindicato patronal cadastrado.`
                  : "Escolha a unidade na ficha para o piso seguir o sindicato patronal certo."}
            </p>
          </div>
          {!pisoInformado && (
            <p className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
              Sem piso informado, este cargo fica sem referência de salário do sindicato. Você pode definir depois em
              Cadastros → Cargos.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={upsert.isPending || upsertPiso.isPending || !nome.trim() || !pisoValido}
            onClick={criar}
          >
            {(upsert.isPending || upsertPiso.isPending) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Criar cargo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
