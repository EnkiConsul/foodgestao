import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Users2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TURNO_LABEL } from "@/lib/dp/dsr-rules";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const TODOS = "__all__";

/** Cobertura mínima por unidade, cargo, dia da semana e turno. */
export function CoberturaMinimaCard() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [unidadeId, setUnidadeId] = useState(TODOS);
  const [cargoId, setCargoId] = useState(TODOS);
  const [diaSemana, setDiaSemana] = useState(TODOS);
  const [turnoId, setTurnoId] = useState(TODOS);
  const [minimo, setMinimo] = useState(1);

  const refs = useQuery({
    queryKey: ["dp_cobertura_refs", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [u, c, t] = await Promise.all([
        supabase.from("dp_unidades").select("id, nome").eq("company_id", selectedCompanyId!).order("nome"),
        supabase.from("dp_cargos").select("id, nome").eq("company_id", selectedCompanyId!).order("nome"),
        supabase.from("dp_turnos").select("id, nome, unidade_id").eq("company_id", selectedCompanyId!)
          .eq("ativo", true).order("entrada"),
      ]);
      if (u.error) throw u.error;
      if (c.error) throw c.error;
      if (t.error) throw t.error;
      return { unidades: u.data ?? [], cargos: c.data ?? [], turnos: t.data ?? [] };
    },
  });

  const lista = useQuery({
    queryKey: ["dp_cobertura_minima", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_cobertura_minima")
        .select("id, unidade_id, cargo_id, dia_semana, turno, turno_id, minimo")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dp_cobertura_minima", selectedCompanyId] });

  const criar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { error } = await supabase.from("dp_cobertura_minima").insert({
        company_id: selectedCompanyId,
        unidade_id: unidadeId === TODOS ? null : unidadeId,
        cargo_id: cargoId === TODOS ? null : cargoId,
        dia_semana: diaSemana === TODOS ? null : Number(diaSemana),
        turno_id: turnoId === TODOS ? null : turnoId,
        minimo,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Regra de cobertura adicionada"); },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar a regra"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_cobertura_minima").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Regra removida"); },
  });

  const nomeUnidade = useMemo(
    () => new Map((refs.data?.unidades ?? []).map((u) => [u.id, u.nome])),
    [refs.data],
  );
  const nomeTurno = useMemo(
    () => new Map((refs.data?.turnos ?? []).map((t) => [t.id, t.nome])),
    [refs.data],
  );
  const nomeCargo = useMemo(
    () => new Map((refs.data?.cargos ?? []).map((c) => [c.id, c.nome])),
    [refs.data],
  );

  return (
    <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Users2 className="h-4 w-4 text-primary" aria-hidden="true" /> Cobertura mínima
        </h2>
        <p className="text-xs text-muted-foreground">
          Quantidade mínima de colaboradores por unidade, cargo, dia e turno. Deixe em “Todos” para aplicar de forma ampla.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="cm-unidade">Unidade</Label>
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger id="cm-unidade"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {(refs.data?.unidades ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-cargo">Cargo</Label>
          <Select value={cargoId} onValueChange={setCargoId}>
            <SelectTrigger id="cm-cargo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {(refs.data?.cargos ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-dia">Dia</Label>
          <Select value={diaSemana} onValueChange={setDiaSemana}>
            <SelectTrigger id="cm-dia"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {DIAS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-turno">Turno</Label>
          <Select value={turnoId} onValueChange={setTurnoId}>
            <SelectTrigger id="cm-turno"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {(refs.data?.turnos ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-min">Mínimo</Label>
          <div className="flex gap-2">
            <Input id="cm-min" type="number" min={1} max={99} value={minimo}
              onChange={(e) => setMinimo(Number(e.target.value) || 1)} />
            <Button size="icon" aria-label="Adicionar regra" disabled={criar.isPending} onClick={() => criar.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {lista.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (lista.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra de cobertura cadastrada.</p>
      ) : (
        <ul className="divide-y">
          {(lista.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                <strong>{r.minimo}</strong> colaborador(es) ·{" "}
                {r.unidade_id ? nomeUnidade.get(r.unidade_id) ?? "Unidade" : "Todas as unidades"} ·{" "}
                {r.cargo_id ? nomeCargo.get(r.cargo_id) ?? "Cargo" : "Todos os cargos"} ·{" "}
                {r.dia_semana == null ? "Todos os dias" : DIAS[r.dia_semana]} ·{" "}
                {r.turno_id
                  ? nomeTurno.get(r.turno_id) ?? "Turno"
                  : r.turno
                    ? TURNO_LABEL[r.turno]
                    : "Todos os turnos"}
              </span>
              <Button size="icon" variant="ghost" aria-label="Remover regra" onClick={() => remover.mutate(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DpContentCard>
  );
}
