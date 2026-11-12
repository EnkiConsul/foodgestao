import { Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { textoSalvas, type ModoExibicao, type ResumoLoteParcial } from "@/lib/dp/documentos/lote-parcial";

/**
 * Peças compartilhadas pela conferência embutida e pela tela cheia quando o
 * lote já tem páginas salvas e sobram páginas para decidir.
 */

export function LoteParcialAviso({ resumo, tipoLabel, className }: {
  resumo: ResumoLoteParcial; tipoLabel: string; className?: string;
}) {
  return (
    <div role="status" className={cn("rounded-md border border-success/40 bg-success/10 p-3", className)}>
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success mt-0.5" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold">{textoSalvas(resumo.salvas)} ({tipoLabel})</p>
          <p className="text-xs text-muted-foreground">
            Já estão no histórico de cada colaborador. Nada precisa ser enviado de novo.
          </p>
          <p className="text-sm">
            {resumo.abertas === 1 ? "Falta decidir 1 página" : `Faltam decidir ${resumo.abertas} páginas`}
            {resumo.semSaida > 0
              ? resumo.semSaida === resumo.abertas ? " de pessoas sem cadastro." : `, ${resumo.semSaida} sem cadastro.`
              : "."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ExibirPaginasToggle({ modo, abertas, total, onPendentes, onTodas, className }: {
  modo: ModoExibicao; abertas: number; total: number;
  onPendentes: () => void; onTodas: () => void; className?: string;
}) {
  if (abertas === 0 || abertas >= total) return null;
  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <span className="text-muted-foreground shrink-0">Exibir:</span>
      <div role="group" aria-label="Páginas exibidas" className="inline-flex rounded-md border p-0.5 bg-muted/30">
        <Button size="sm" variant={modo === "pendentes" ? "default" : "ghost"} className="h-9 px-3"
          aria-pressed={modo === "pendentes"} onClick={onPendentes}>
          Pendentes ({abertas})
        </Button>
        <Button size="sm" variant={modo === "todas" ? "default" : "ghost"} className="h-9 px-3"
          aria-pressed={modo === "todas"} onClick={onTodas}>
          Todas ({total})
        </Button>
      </div>
    </div>
  );
}

export function ConcluirIgnorandoBotao({ semSaida, concluindo, onClick, className }: {
  semSaida: number; concluindo: boolean; onClick: () => void; className?: string;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-1 sm:w-auto sm:items-end", className)}>
      <Button variant="outline" className="w-full sm:w-auto h-auto min-h-11 whitespace-normal py-2" onClick={onClick} disabled={concluindo}>
        {concluindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin shrink-0" /> : <Check className="h-4 w-4 mr-1 shrink-0" />}
        <span className="text-center leading-tight">
          Concluir lote ignorando {semSaida} {semSaida === 1 ? "página" : "páginas"}
        </span>
      </Button>
      <p className="text-[11px] text-muted-foreground sm:text-right">
        Para salvar, crie o cadastro ou escolha o colaborador na página.
      </p>
    </div>
  );
}

export function ConcluirIgnorandoDialog({ open, onOpenChange, resumo, concluindo, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; resumo: ResumoLoteParcial;
  concluindo: boolean; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !concluindo && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Concluir o lote?</AlertDialogTitle>
          <AlertDialogDescription>
            {resumo.semSaida === 1
              ? "A página sem colaborador será ignorada"
              : `As ${resumo.semSaida} páginas sem colaborador serão ignoradas`} e o lote será concluído.
            {resumo.salvas > 0 && ` ${textoSalvas(resumo.salvas)} e ${resumo.salvas === 1 ? "continua" : "continuam"} no histórico dos colaboradores.`}
            {" "}Se precisar, envie depois só a página que faltou.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={concluindo}>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={concluindo} onClick={(e) => { e.preventDefault(); onConfirm(); }}>
            {concluindo && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Concluir lote
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
