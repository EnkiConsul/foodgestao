import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDpUnidades,
  useDpCargoSalarios,
  useUpsertDpCargoSalario,
  useDeleteDpCargoSalario,
} from "@/hooks/useDpCadastros";
import { moedaBR } from "@/lib/dp/cargos";
import { numeroBR } from "@/components/dp/RemuneracaoFields";
import { pisoVigente } from "@/lib/dp/cargoSalarios";

interface Props {
  cargoId: string;
  /** Salário geral do cargo, usado como referência quando a unidade não tem piso. */
  salarioGeral?: number | null;
}

/**
 * Salário do cargo por unidade. O sindicato laboral é do cargo, mas o patronal
 * é da unidade — logo o piso negociado pode ser diferente em cada unidade.
 */
export function CargoSalariosUnidadePanel({ cargoId, salarioGeral }: Props) {
  const unidades = useDpUnidades();
  const pisos = useDpCargoSalarios(cargoId);
  const upsert = useUpsertDpCargoSalario();
  const del = useDeleteDpCargoSalario();

  const hoje = new Date().toISOString().slice(0, 10);
  const [novo, setNovo] = useState({ unidade_id: "", salario_base: "", vigencia_inicio: hoje });

  const nomeUnidade = (id: string) =>
    (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "Unidade";

  const vigentes = useMemo(
    () => (pisos.data ?? []).filter((p) => pisoVigente(p as any, hoje)),
    [pisos.data, hoje],
  );

  const disponiveis = (unidades.data ?? []).filter(
    (u) => !vigentes.some((p) => p.unidade_id === u.id),
  );

  const salvar = async () => {
    const valor = numeroBR(novo.salario_base);
    if (!novo.unidade_id) return toast.error("Escolha a unidade.");
    if (!valor || valor <= 0) return toast.error("Informe o salário da unidade.");
    try {
      await upsert.mutateAsync({
        cargo_id: cargoId,
        unidade_id: novo.unidade_id,
        salario_base: valor,
        vigencia_inicio: novo.vigencia_inicio || hoje,
      });
      setNovo({ unidade_id: "", salario_base: "", vigencia_inicio: hoje });
      toast.success("Salário da unidade registrado.");
    } catch (e) {
      toast.error("Não foi possível salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">Salário por unidade</Label>
        <p className="text-xs text-muted-foreground">
          Convenções patronais diferentes podem gerar pisos diferentes para o mesmo cargo.
          Sem valor próprio, a unidade usa o salário de referência do cargo
          {salarioGeral != null ? ` (${moedaBR(Number(salarioGeral))})` : " (não definido)"}.
        </p>
      </div>

      {vigentes.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {vigentes.map((p) => (
            <li key={p.id} className="flex items-center gap-2 p-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nomeUnidade(p.unidade_id)}</p>
                <p className="text-xs text-muted-foreground">
                  Desde {new Date(`${p.vigencia_inicio}T12:00:00`).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {moedaBR(Number(p.salario_base))}
              </Badge>
              <Button
                size="icon" variant="ghost" className="shrink-0"
                aria-label={`Remover salário de ${nomeUnidade(p.unidade_id)}`}
                onClick={async () => {
                  try {
                    await del.mutateAsync(p.id);
                    toast.success("Salário da unidade removido.");
                  } catch (e) {
                    toast.error("Não foi possível remover", {
                      description: e instanceof Error ? e.message : String(e),
                    });
                  }
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum salário específico por unidade. Todas usam o salário de referência do cargo.
        </p>
      )}

      {disponiveis.length > 0 && (
        <div className="grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div>
            <Label className="text-xs">Unidade</Label>
            <Select value={novo.unidade_id} onValueChange={(v) => setNovo({ ...novo, unidade_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {disponiveis.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Salário</Label>
            <Input
              inputMode="decimal" placeholder="0,00" className="sm:w-28"
              value={novo.salario_base}
              onChange={(e) => setNovo({ ...novo, salario_base: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Vigência</Label>
            <Input
              type="date" className="sm:w-40"
              value={novo.vigencia_inicio}
              onChange={(e) => setNovo({ ...novo, vigencia_inicio: e.target.value })}
            />
          </div>
          <Button onClick={salvar} disabled={upsert.isPending}>
            <Plus className="size-4 mr-1" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}
