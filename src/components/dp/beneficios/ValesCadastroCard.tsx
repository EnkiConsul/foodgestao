// ------------------------------------------------------------------
// Domínio: DP → VA e VT dentro do Cadastro de Benefícios.
//
// Os dois vales aparecem como itens fixos do cadastro, com as mesmas regras da
// aba Remuneração do colaborador. A empresa que não concede um deles pode
// removê-lo — e reativar depois, sem perder as regras.
// ------------------------------------------------------------------

import { useState } from "react";
import { Pencil, Trash2, Utensils, Bus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DpContentCard } from "@/components/dp/DpPage";
import { ValeRegrasDialog } from "@/components/dp/beneficios/ValeRegrasDialog";
import {
  useDpValeRegrasEmpresa, useSalvarValeRegrasEmpresa,
} from "@/hooks/useDpValeRegras";
import { DIA_PAGAMENTO_PADRAO, DIAS_CORTE_PADRAO } from "@/lib/dp/va-calculo";
import type { ValeTipo } from "@/hooks/useDpValeCalculadora";
import { toast } from "sonner";

interface Props {
  unidades: { id: string; nome: string }[];
  cargos: { id: string; nome: string }[];
}

const META: Record<ValeTipo, { nome: string; icone: typeof Utensils }> = {
  va: { nome: "Vale-Alimentação", icone: Utensils },
  vt: { nome: "Vale-Transporte", icone: Bus },
};

export function ValesCadastroCard({ unidades, cargos }: Props) {
  const regras = useDpValeRegrasEmpresa();
  const salvar = useSalvarValeRegrasEmpresa();
  const [editando, setEditando] = useState<ValeTipo | null>(null);
  const [removendo, setRemovendo] = useState<ValeTipo | null>(null);

  const r = regras.data;

  const alternar = async (tipo: ValeTipo, ativo: boolean) => {
    try {
      await salvar.mutateAsync({
        tipo,
        patch: { [`${tipo}_ativo`]: ativo },
        desligarColaboradores: !ativo,
      });
      toast.success(
        ativo
          ? `${META[tipo].nome} reativado no cadastro.`
          : `${META[tipo].nome} removido — a empresa deixou de conceder este vale.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível atualizar o benefício.");
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <>
      <DpContentCard>
        <div className="divide-y divide-border">
          {(["va", "vt"] as ValeTipo[]).map((tipo) => {
            const { nome, icone: Icone } = META[tipo];
            const ativo = tipo === "va" ? r?.va_ativo ?? true : r?.vt_ativo ?? true;
            const dia = tipo === "va" ? r?.va_dia_pagamento : r?.vt_dia_pagamento;
            const corte = tipo === "va" ? r?.va_dias_corte : r?.vt_dias_corte;
            return (
              <div
                key={tipo}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Icone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{nome}</p>
                    <p className="text-xs text-muted-foreground">
                      Pago por dia · depósito dia {dia ?? DIA_PAGAMENTO_PADRAO} · corte{" "}
                      {corte ?? DIAS_CORTE_PADRAO} dias antes · regras por empresa, unidade e cargo
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">Benefício do sistema</Badge>
                  {!ativo && <Badge variant="outline">Não concedido</Badge>}
                  {ativo ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar regras do ${nome}`}
                        onClick={() => setEditando(tipo)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover ${nome}`}
                        onClick={() => setRemovendo(tipo)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => alternar(tipo, true)}>
                      <RotateCcw className="mr-1.5 size-4" /> Reativar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DpContentCard>

      {editando && (
        <ValeRegrasDialog
          open={!!editando}
          onOpenChange={(o) => !o && setEditando(null)}
          tipo={editando}
          unidades={unidades}
          cargos={cargos}
        />
      )}

      <AlertDialog open={!!removendo} onOpenChange={(o) => !o && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover {removendo ? META[removendo].nome : "benefício"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O benefício sai do cadastro e é desmarcado na ficha dos colaboradores ativos. As
              regras ficam guardadas: você pode reativar quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removendo && alternar(removendo, false)}
              disabled={salvar.isPending}
            >
              Remover Benefício
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
