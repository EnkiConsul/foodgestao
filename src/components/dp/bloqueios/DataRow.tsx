import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarCheck, CalendarX, Filter, Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBR, type DataBloq } from "@/lib/dp/bloqueios";

type Props = {
  data: DataBloq;
  onEdit: (d: DataBloq) => void;
  onDelete: (id: string) => void;
  onRebloquear: (d: DataBloq) => void;
};

export function DataRow({ data: d, onEdit, onDelete, onRebloquear }: Props) {
  const auto = !!d.regra_id;
  const liberada = d.liberada === true || !!d.liberada_por_solicitacao;
  return (
    <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-muted/20">
      <div className="flex items-center gap-4 flex-1 min-w-[300px]">
        <div className={cn(
          "size-10 rounded-xl flex items-center justify-center",
          liberada ? "bg-emerald-500/15 text-emerald-600"
            : auto ? "bg-amber-500/15 text-amber-600"
            : "bg-rose-500/15 text-rose-600",
        )}>
          {liberada ? <CalendarCheck className="size-5" /> : <CalendarX className="size-5" />}
        </div>
        <div>
          <div className="font-semibold">{formatBR(d.data)}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
            <span>{d.motivo}</span>
            {d.unidade
              ? <Badge variant="outline">{d.unidade.nome}</Badge>
              : <Badge variant="outline">Global</Badge>}
            <Badge variant="outline" className={auto
              ? "bg-amber-500/10 text-amber-700 border-amber-500/40"
              : "bg-rose-500/10 text-rose-700 border-rose-500/40"}>
              {auto ? "Automático" : "Manual"}
            </Badge>
            <Badge variant="outline" className={liberada
              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/40"
              : "bg-rose-500/10 text-rose-700 border-rose-500/40"}>
              {liberada ? "Liberada" : "Bloqueada"}
            </Badge>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        {liberada && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-rose-500/40 text-rose-700 hover:bg-rose-500/10"
              >
                <Lock className="size-4 mr-2" />
                Bloquear Novamente
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bloquear esta data novamente?</AlertDialogTitle>
                <AlertDialogDescription>
                  A data voltará a ficar indisponível para folgas, seguindo a regra original.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRebloquear(d)}>
                  Bloquear novamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!auto && !liberada && (
          <>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => onEdit(d)}>
              <Filter className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10">
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover este bloqueio?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(d.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}
