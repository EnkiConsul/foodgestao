import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDpCargos,
  useDpCargoSalarios,
  useUpsertDpCargoSalario,
} from "@/hooks/useDpCadastros";
import { moedaBR } from "@/lib/dp/cargos";
import { numeroBR } from "@/components/dp/RemuneracaoFields";
import { aplicarReajuste, salarioCargoNaUnidade } from "@/lib/dp/cargoSalarios";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  unidadeId: string;
  unidadeNome: string;
  /** Sindicato patronal da negociação, guardado como origem do piso. */
  sindicatoPatronalId?: string | null;
  /** Vigência sugerida (primeiro dia do mês da negociação). */
  vigenciaInicio: string;
}

/**
 * Aplica o resultado da negociação patronal aos cargos da unidade: cada unidade
 * pode ter piso próprio, então o valor é gravado em dp_cargo_salarios.
 */
export function AplicarPisoUnidadeDialog({
  open, onOpenChange, unidadeId, unidadeNome, sindicatoPatronalId, vigenciaInicio,
}: Props) {
  const cargos = useDpCargos();
  const pisos = useDpCargoSalarios();
  const upsert = useUpsertDpCargoSalario();

  const [modo, setModo] = useState<"percentual" | "valor">("percentual");
  const [percentual, setPercentual] = useState("");
  const [valor, setValor] = useState("");
  const [vigencia, setVigencia] = useState(vigenciaInicio);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelecionados([]);
      setVigencia(vigenciaInicio);
      setPercentual("");
      setValor("");
    }
  }, [open, vigenciaInicio]);

  const atual = (cargoId: string, salarioGeral: number | null) =>
    salarioCargoNaUnidade(
      salarioGeral,
      (pisos.data ?? []).filter((p) => p.cargo_id === cargoId) as any,
      unidadeId,
      vigencia,
    );

  const novoValor = (base: number | null) => {
    if (modo === "valor") return numeroBR(valor);
    if (!base) return 0;
    return aplicarReajuste(base, numeroBR(percentual));
  };

  const lista = useMemo(() => cargos.data ?? [], [cargos.data]);

  const aplicar = async () => {
    if (selecionados.length === 0) return toast.error("Selecione ao menos um cargo.");
    let ok = 0;
    const semBase: string[] = [];
    for (const cargoId of selecionados) {
      const cargo = lista.find((c) => c.id === cargoId);
      const base = atual(cargoId, (cargo as any)?.salario_base ?? null).valor;
      const alvo = novoValor(base);
      if (!alvo || alvo <= 0) {
        semBase.push(cargo?.nome ?? "cargo");
        continue;
      }
      try {
        await upsert.mutateAsync({
          cargo_id: cargoId,
          unidade_id: unidadeId,
          salario_base: alvo,
          vigencia_inicio: vigencia,
          sindicato_patronal_id: sindicatoPatronalId ?? null,
        });
        ok += 1;
      } catch (e) {
        toast.error(`Não foi possível aplicar em ${cargo?.nome ?? "cargo"}`, {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (ok > 0) toast.success(`Piso aplicado em ${ok} cargo(s) de ${unidadeNome}.`);
    if (semBase.length > 0) {
      toast.warning("Sem salário base para reajustar", { description: semBase.join(", ") });
    }
    if (ok > 0) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar aos cargos de {unidadeNome}</DialogTitle>
          <DialogDescription>
            O piso negociado vale para esta unidade. Cargos de outras unidades, mesmo com o
            mesmo sindicato laboral, mantêm os valores das suas próprias convenções patronais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Aplicar como</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentual">Reajuste %</SelectItem>
                  <SelectItem value="valor">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{modo === "percentual" ? "Percentual" : "Salário"}</Label>
              <Input
                inputMode="decimal"
                placeholder={modo === "percentual" ? "Ex: 5,5" : "0,00"}
                value={modo === "percentual" ? percentual : valor}
                onChange={(e) => (modo === "percentual" ? setPercentual(e.target.value) : setValor(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Vigência</Label>
              <Input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
            {lista.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhum cargo cadastrado.</p>
            ) : (
              lista.map((c) => {
                const ref = atual(c.id, (c as any).salario_base ?? null);
                const alvo = novoValor(ref.valor);
                const marcado = selecionados.includes(c.id);
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 p-2 text-sm">
                    <Checkbox
                      checked={marcado}
                      onCheckedChange={(v) =>
                        setSelecionados((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {ref.valor ? moedaBR(ref.valor) : "sem base"}
                      {alvo > 0 ? ` → ${moedaBR(alvo)}` : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={aplicar} disabled={upsert.isPending}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
