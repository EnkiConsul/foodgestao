import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDpUnidades,
  useDpSindicatos,
  useDpCargoSalarios,
  useDpPatronalPorUnidade,
  useUpsertDpCargoSalario,
  useDeleteDpCargoSalario,
} from "@/hooks/useDpCadastros";
import { moedaBR } from "@/lib/dp/cargos";
import { numeroBR } from "@/components/dp/RemuneracaoFields";
import { pisoVigente, pisoDoPatronal, validarOverrideUnidade } from "@/lib/dp/cargoSalarios";

interface Props {
  cargoId: string;
}

/**
 * Piso salarial do cargo por sindicato patronal (o patronal é da unidade), com
 * ajustes opcionais por unidade que precisam respeitar o piso do patronal.
 */
export function CargoSalariosUnidadePanel({ cargoId }: Props) {
  const unidades = useDpUnidades();
  const sindicatos = useDpSindicatos();
  const patronalPorUnidade = useDpPatronalPorUnidade();
  const linhas = useDpCargoSalarios(cargoId);
  const upsert = useUpsertDpCargoSalario();
  const del = useDeleteDpCargoSalario();

  const hoje = new Date().toISOString().slice(0, 10);
  const [novoPiso, setNovoPiso] = useState({ patronal_id: "", salario_base: "", vigencia_inicio: hoje });
  const [novoAjuste, setNovoAjuste] = useState({ unidade_id: "", salario_base: "", vigencia_inicio: hoje });

  const patronais = useMemo(
    () => (sindicatos.data ?? []).filter((s) => s.tipo === "patronal"),
    [sindicatos.data],
  );
  const nomePatronal = (id: string) => patronais.find((s) => s.id === id)?.nome ?? "Sindicato patronal";
  const nomeUnidade = (id: string) => (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "Unidade";

  const vigentes = useMemo(
    () => (linhas.data ?? []).filter((p) => pisoVigente(p as any, hoje)),
    [linhas.data, hoje],
  );
  const pisos = vigentes.filter((p) => !p.unidade_id && p.sindicato_patronal_id);
  const ajustes = vigentes.filter((p) => !!p.unidade_id);

  /** Unidades por patronal, para mostrar quem compartilha cada piso. */
  const unidadesDoPatronal = (patronalId: string) =>
    (unidades.data ?? []).filter((u) => patronalPorUnidade.data?.[u.id]?.id === patronalId);

  const semPatronal = (unidades.data ?? []).filter((u) => !patronalPorUnidade.data?.[u.id]);

  const patronaisDisponiveis = patronais.filter((s) => !pisos.some((p) => p.sindicato_patronal_id === s.id));
  const unidadesDisponiveis = (unidades.data ?? []).filter(
    (u) => !!patronalPorUnidade.data?.[u.id] && !ajustes.some((a) => a.unidade_id === u.id),
  );

  const salvarPiso = async () => {
    const valor = numeroBR(novoPiso.salario_base);
    if (!novoPiso.patronal_id) return toast.error("Escolha o sindicato patronal.");
    if (!valor || valor <= 0) return toast.error("Informe o piso negociado.");
    try {
      await upsert.mutateAsync({
        cargo_id: cargoId,
        unidade_id: null,
        sindicato_patronal_id: novoPiso.patronal_id,
        salario_base: valor,
        vigencia_inicio: novoPiso.vigencia_inicio || hoje,
      });
      setNovoPiso({ patronal_id: "", salario_base: "", vigencia_inicio: hoje });
      toast.success("Piso do sindicato patronal registrado.");
    } catch (e) {
      toast.error("Não foi possível salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const salvarAjuste = async () => {
    const valor = numeroBR(novoAjuste.salario_base);
    const patronalId = novoAjuste.unidade_id
      ? patronalPorUnidade.data?.[novoAjuste.unidade_id]?.id ?? null
      : null;
    if (!novoAjuste.unidade_id) return toast.error("Escolha a unidade.");
    const piso = pisoDoPatronal(linhas.data as any, patronalId, novoAjuste.vigencia_inicio || hoje);
    const check = validarOverrideUnidade(valor, piso ? Number(piso.salario_base) : null);
    if (!check.ok) {
      return toast.error(
        check.motivo === "abaixo_do_piso"
          ? `O valor não pode ficar abaixo do piso do patronal (${moedaBR(check.piso!)}).`
          : check.motivo === "sem_piso_patronal"
            ? "Cadastre primeiro o piso do sindicato patronal desta unidade."
            : "Informe um salário válido.",
      );
    }
    try {
      await upsert.mutateAsync({
        cargo_id: cargoId,
        unidade_id: novoAjuste.unidade_id,
        sindicato_patronal_id: patronalId,
        salario_base: valor,
        vigencia_inicio: novoAjuste.vigencia_inicio || hoje,
      });
      setNovoAjuste({ unidade_id: "", salario_base: "", vigencia_inicio: hoje });
      toast.success("Salário da unidade registrado.");
    } catch (e) {
      toast.error("Não foi possível salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const remover = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast.success("Registro removido.");
    } catch (e) {
      toast.error("Não foi possível remover", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Piso por sindicato patronal */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Piso por sindicato patronal</Label>
          <p className="text-xs text-muted-foreground">
            O piso é negociado pelo patronal, que é vinculado à unidade. Unidades com o mesmo
            patronal usam o mesmo piso; patronais diferentes exigem cadastro próprio.
          </p>
        </div>

        {pisos.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {pisos.map((p) => {
              const compart = unidadesDoPatronal(p.sindicato_patronal_id!);
              return (
                <li key={p.id} className="flex items-center gap-2 p-2">
                  <Landmark className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nomePatronal(p.sindicato_patronal_id!)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Desde {new Date(`${p.vigencia_inicio}T12:00:00`).toLocaleDateString("pt-BR")}
                      {compart.length > 0 ? ` · ${compart.map((u) => u.nome).join(", ")}` : " · sem unidades vinculadas"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {moedaBR(Number(p.salario_base))}
                  </Badge>
                  <Button
                    size="icon" variant="ghost" className="shrink-0"
                    aria-label={`Remover piso de ${nomePatronal(p.sindicato_patronal_id!)}`}
                    onClick={() => remover(p.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum piso cadastrado. Sem piso, a folha fica pendente de remuneração para este cargo.
          </p>
        )}

        {patronaisDisponiveis.length > 0 && (
          <div className="grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div>
              <Label className="text-xs">Sindicato patronal</Label>
              <Select value={novoPiso.patronal_id} onValueChange={(v) => setNovoPiso({ ...novoPiso, patronal_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {patronaisDisponiveis.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Piso</Label>
              <Input
                inputMode="decimal" placeholder="0,00" className="sm:w-28"
                value={novoPiso.salario_base}
                onChange={(e) => setNovoPiso({ ...novoPiso, salario_base: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Vigência</Label>
              <Input
                type="date" className="sm:w-40"
                value={novoPiso.vigencia_inicio}
                onChange={(e) => setNovoPiso({ ...novoPiso, vigencia_inicio: e.target.value })}
              />
            </div>
            <Button onClick={salvarPiso} disabled={upsert.isPending}>
              <Plus className="size-4 mr-1" /> Adicionar
            </Button>
          </div>
        )}
      </div>

      {/* Ajuste por unidade (acima do piso) */}
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Salário maior em uma unidade (opcional)</Label>
          <p className="text-xs text-muted-foreground">
            Mesmo com o patronal igual, uma unidade pode pagar mais — nunca abaixo do piso.
          </p>
        </div>

        {ajustes.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {ajustes.map((p) => (
              <li key={p.id} className="flex items-center gap-2 p-2">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nomeUnidade(p.unidade_id!)}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {new Date(`${p.vigencia_inicio}T12:00:00`).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {moedaBR(Number(p.salario_base))}
                </Badge>
                <Button
                  size="icon" variant="ghost" className="shrink-0"
                  aria-label={`Remover salário de ${nomeUnidade(p.unidade_id!)}`}
                  onClick={() => remover(p.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {unidadesDisponiveis.length > 0 && (
          <div className="grid gap-2 rounded-lg border border-dashed p-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={novoAjuste.unidade_id} onValueChange={(v) => setNovoAjuste({ ...novoAjuste, unidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {unidadesDisponiveis.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Salário</Label>
              <Input
                inputMode="decimal" placeholder="0,00" className="sm:w-28"
                value={novoAjuste.salario_base}
                onChange={(e) => setNovoAjuste({ ...novoAjuste, salario_base: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Vigência</Label>
              <Input
                type="date" className="sm:w-40"
                value={novoAjuste.vigencia_inicio}
                onChange={(e) => setNovoAjuste({ ...novoAjuste, vigencia_inicio: e.target.value })}
              />
            </div>
            <Button variant="outline" onClick={salvarAjuste} disabled={upsert.isPending}>
              <Plus className="size-4 mr-1" /> Adicionar
            </Button>
          </div>
        )}
      </div>

      {semPatronal.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Sem sindicato patronal vinculado: {semPatronal.map((u) => u.nome).join(", ")}. Vincule o
          patronal da unidade para o sistema saber qual piso aplicar.
        </p>
      )}
    </div>
  );
}
