import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Globe2, MapPin, LockOpen } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Data em pt-BR (dd/mm/aaaa) para exibir no cabeçalho. */
  dataLabel: string;
  /** Nome da unidade ativa. Quando `null`, esconde a opção "só nesta unidade". */
  unidadeNome: string | null;
  /** Motivo/origem do bloqueio, exibido acima das opções. */
  motivo?: string | null;
  /** Chamado ao escolher liberar somente para a unidade. */
  onLiberarUnidade: () => void;
  /** Chamado ao escolher liberar globalmente. */
  onLiberarGlobal: () => void;
  loading?: boolean;
};

export function LiberarEscopoDialog({
  open,
  onOpenChange,
  dataLabel,
  unidadeNome,
  motivo,
  onLiberarUnidade,
  onLiberarGlobal,
  loading,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LockOpen className="size-5 text-emerald-600" />
            Liberar {dataLabel}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {motivo && (
                <p>
                  Origem do bloqueio:{" "}
                  <span className="font-semibold text-foreground">{motivo}</span>
                </p>
              )}
              <p>
                Esta data é bloqueada por uma regra <b>global</b>. Escolha o
                escopo do desbloqueio:
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {unidadeNome && (
            <Button
              variant="outline"
              disabled={loading}
              className="h-auto w-full justify-start gap-3 rounded-xl border-emerald-500/40 p-4 text-left hover:bg-emerald-500/10"
              onClick={onLiberarUnidade}
            >
              <MapPin className="size-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground">
                  Liberar só para {unidadeNome}
                </div>
                <div className="text-xs text-muted-foreground">
                  As demais unidades continuam bloqueadas pela regra.
                </div>
              </div>
            </Button>
          )}

          <Button
            variant="outline"
            disabled={loading}
            className="h-auto w-full justify-start gap-3 rounded-xl border-amber-500/40 p-4 text-left hover:bg-amber-500/10"
            onClick={onLiberarGlobal}
          >
            <Globe2 className="size-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">
                Liberar para todas as unidades
              </div>
              <div className="text-xs text-muted-foreground">
                Cria um override global; a regra continua ativa nas demais
                datas.
              </div>
            </div>
          </Button>

          {!unidadeNome && (
            <p className="text-xs text-muted-foreground">
              Nenhuma unidade específica está selecionada no filtro. Para
              liberar apenas uma unidade, selecione-a no filtro do calendário e
              tente novamente.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
