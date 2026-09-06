import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ReplicarModo } from "@/hooks/useDpFeriados";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidadeId: string;
  totalOrigem: number;
  saving?: boolean;
  onConfirm: (input: { destinos: string[]; modo: ReplicarModo }) => void;
}

type UnidadeDestino = { id: string; nome: string; total: number };

/** Copia o calendário de feriados desta unidade para outras unidades da empresa. */
export function ReplicarFeriadosDialog({
  open, onOpenChange, unidadeId, totalOrigem, saving, onConfirm,
}: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [modo, setModo] = useState<ReplicarModo>("completar");
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (open) {
      setSelecionadas([]);
      setModo("completar");
      setConfirmando(false);
    }
  }, [open]);

  const { data: unidades = [], isLoading } = useQuery({
    queryKey: ["dp_unidades_feriados_destino", selectedCompanyId, unidadeId],
    enabled: open && !!selectedCompanyId,
    queryFn: async (): Promise<UnidadeDestino[]> => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .neq("id", unidadeId)
        .order("nome");
      if (error) throw error;
      const ids = (data ?? []).map((u) => u.id);
      if (ids.length === 0) return [];
      const { data: fer, error: ferErr } = await supabase
        .from("dp_unidade_feriados")
        .select("unidade_id")
        .in("unidade_id", ids);
      if (ferErr) throw ferErr;
      const contagem = new Map<string, number>();
      (fer ?? []).forEach((r: any) =>
        contagem.set(r.unidade_id, (contagem.get(r.unidade_id) ?? 0) + 1),
      );
      return (data ?? []).map((u) => ({
        id: u.id,
        nome: u.nome,
        total: contagem.get(u.id) ?? 0,
      }));
    },
  });

  const todasMarcadas = unidades.length > 0 && selecionadas.length === unidades.length;
  const alvosComDados = useMemo(
    () => unidades.filter((u) => selecionadas.includes(u.id) && u.total > 0),
    [unidades, selecionadas],
  );

  const alternar = (id: string, v: boolean) =>
    setSelecionadas((prev) => (v ? [...prev, id] : prev.filter((x) => x !== id)));

  const substituirPerigoso = modo === "substituir" && alvosComDados.length > 0;

  const confirmar = () => {
    if (substituirPerigoso && !confirmando) {
      setConfirmando(true);
      return;
    }
    onConfirm({ destinos: selecionadas, modo });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Replicar para outras unidades</DialogTitle>
          <DialogDescription>
            Copia os {totalOrigem} feriado(s) desta unidade para as unidades escolhidas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando unidades…</p>
        ) : unidades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há outra unidade cadastrada nesta empresa.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border">
              <label className="flex items-center gap-3 border-b p-3 text-sm font-medium">
                <Checkbox
                  checked={todasMarcadas}
                  onCheckedChange={(v) =>
                    setSelecionadas(v === true ? unidades.map((u) => u.id) : [])
                  }
                  aria-label="Selecionar todas as unidades"
                />
                Selecionar todas
              </label>
              <ul className="max-h-56 divide-y overflow-y-auto">
                {unidades.map((u) => (
                  <li key={u.id}>
                    <label className="flex cursor-pointer items-center gap-3 p-3 text-sm">
                      <Checkbox
                        checked={selecionadas.includes(u.id)}
                        onCheckedChange={(v) => alternar(u.id, v === true)}
                        aria-label={`Selecionar ${u.nome}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{u.nome}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {u.total} feriado(s)
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <RadioGroup
              value={modo}
              onValueChange={(v) => {
                setModo(v as ReplicarModo);
                setConfirmando(false);
              }}
              className="gap-3"
            >
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="completar" id="modo-completar" className="mt-1" />
                <Label htmlFor="modo-completar" className="cursor-pointer font-normal">
                  <span className="block text-sm font-medium">Completar</span>
                  <span className="block text-xs text-muted-foreground">
                    Copia só o que falta. Nada é apagado.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="substituir" id="modo-substituir" className="mt-1" />
                <Label htmlFor="modo-substituir" className="cursor-pointer font-normal">
                  <span className="block text-sm font-medium">Substituir</span>
                  <span className="block text-xs text-muted-foreground">
                    Apaga o calendário da unidade e deixa igual ao desta.
                  </span>
                </Label>
              </div>
            </RadioGroup>

            {substituirPerigoso && (
              <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  {alvosComDados.length} unidade(s) já têm feriados cadastrados e serão
                  apagados. {confirmando ? "Clique de novo para confirmar." : ""}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={saving || selecionadas.length === 0 || totalOrigem === 0}
            variant={substituirPerigoso && confirmando ? "destructive" : "default"}
          >
            <Copy className="mr-1 h-4 w-4" />
            {substituirPerigoso && confirmando ? "Confirmar substituição" : "Replicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
