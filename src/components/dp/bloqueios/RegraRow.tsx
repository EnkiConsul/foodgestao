import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, CalendarCheck, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMonthName, getTipoLabel, NOMES_ORDINAIS, NOMES_SEMANA, type Regra } from "@/lib/dp/bloqueios";

type Props = {
  regra: Regra;
  onEdit: (r: Regra) => void;
  onDelete: (id: string) => void;
};

export function RegraRow({ regra: r, onEdit, onDelete }: Props) {
  const cfg = r.regra_json ?? {};
  return (
    <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-muted/20">
      <div className="flex items-center gap-4 flex-1 min-w-[300px]">
        <div className={cn(
          "size-10 rounded-xl flex items-center justify-center",
          r.ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}>
          <CalendarCheck className="size-5" />
        </div>
        <div>
          <div className="font-semibold">{r.nome}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
              {getTipoLabel(r.tipo)}
            </span>
            {r.tipo === "fixa_anual" && (
              <>
                <span>Meses: {(cfg.meses ?? []).map(getMonthName).join(", ") || "Todos"}</span>
                <span>Dias: {(cfg.dias ?? []).join(", ") || "Todos"}</span>
              </>
            )}
            {r.tipo === "dinamica" && (
              <>
                <span>Mês: {cfg.meses?.[0] ? getMonthName(cfg.meses[0]) : "?"}</span>
                <span>{NOMES_ORDINAIS[(cfg.ordinal ?? 1) - 1]} {NOMES_SEMANA[cfg.dia_semana ?? 0]}</span>
              </>
            )}
            {r.tipo === "pos_pagamento" && (
              <span>
                Mês: {cfg.meses?.[0] ? getMonthName(cfg.meses[0]) : "Todos"} — após dia {cfg.pos_pagamento_dia ?? 5}
              </span>
            )}
            {cfg.aplicacao === "unica" && cfg.ano_referencia && (
              <span className="text-amber-600 font-medium">🔹 Única vez — {cfg.ano_referencia}</span>
            )}
            {(cfg.aplicacao ?? "anual") === "anual" && (
              <span className="text-emerald-600 font-medium">🔄 Anual</span>
            )}
            {!r.ativo && <span className="text-destructive font-medium">Inativa</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1 items-center">
            {r.unidades && r.unidades.length > 0 ? (
              <>
                <Building2 className="size-3 text-muted-foreground" />
                {r.unidades.map((u) => (
                  <Badge key={u.id} variant="outline" className="text-xs">{u.nome}</Badge>
                ))}
              </>
            ) : (
              <Badge variant="secondary" className="text-xs">Global (todas as unidades)</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => onEdit(r)}>
          <Pencil className="size-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10">
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta regra?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. A regra será removida permanentemente e as datas automáticas geradas por ela serão recalculadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(r.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
