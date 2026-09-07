import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BellRing, ShieldAlert } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDpFeriasCobertura } from "@/hooks/useDpFeriasCobertura";
import { useDpCargos } from "@/hooks/useDpCadastros";
import type { FeriasGozo } from "@/hooks/useDpFerias";

type Props = {
  gozo: (FeriasGozo & { colaborador_nome?: string | null; unidade_id?: string | null; cargo_id?: string | null }) | null;
  onOpenChange: (v: boolean) => void;
};

const fmt = (iso: string) => format(parseISO(iso), "dd/MM (EEE)", { locale: ptBR });

/** Mostra os dias descobertos durante as férias e leva para uma nova convocação. */
export function FeriasCoberturaDialog({ gozo, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data: dias = [], isLoading } = useDpFeriasCobertura(gozo?.id ?? null);
  const { data: cargos = [] } = useDpCargos();

  const nomeCargo = useMemo(
    () => new Map((cargos as any[]).map((c) => [c.id, c.nome as string])),
    [cargos],
  );

  const abrirConvocacao = () => {
    if (!gozo) return;
    const datas = Array.from(new Set(dias.map((d) => d.data))).slice(0, 31);
    const cargoId = dias.find((d) => d.cargo_id)?.cargo_id ?? gozo.cargo_id ?? "";
    const query = new URLSearchParams({ nova: "1", datas: datas.join(",") });
    if (cargoId) query.set("cargo", cargoId);
    if (gozo.unidade_id) query.set("unidade", gozo.unidade_id);
    navigate(`/dp/convocacoes?${query.toString()}`);
  };

  return (
    <Dialog open={!!gozo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber-500" aria-hidden="true" />
            Cobertura durante as férias
          </DialogTitle>
          <DialogDescription>
            {gozo
              ? `${gozo.colaborador_nome ?? "Colaborador"} · ${format(parseISO(gozo.data_inicio), "dd/MM/yyyy")} a ${format(parseISO(gozo.data_fim), "dd/MM/yyyy")}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">Calculando…</p>
        ) : dias.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum dia fica abaixo do mínimo da equipe nesse período.
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {dias.map((d, i) => (
              <div
                key={`${d.data}-${d.cargo_id ?? "todos"}-${i}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{fmt(d.data)}</span>
                <span className="truncate text-muted-foreground">
                  {d.cargo_id ? nomeCargo.get(d.cargo_id) ?? "Cargo" : "Todos os cargos"}
                </span>
                <Badge variant="outline" className="border-amber-400 text-amber-600">
                  faltam {d.faltam} de {d.minimo}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={dias.length === 0} onClick={abrirConvocacao}>
            <BellRing className="mr-1 size-4" /> Convocar para esses dias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
