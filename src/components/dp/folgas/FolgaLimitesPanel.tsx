import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useDpFolgaLimites, type RegraLimiteInput } from "@/hooks/useDpFolgaLimites";
import { resumoRegraLimite, type RegraLimiteFolga } from "@/lib/dp/folga-limites";
import { DIA_SEMANA_LABEL, ORDEM_DIAS_SEG_DOM } from "@/lib/dp/dsr-rules";

const VAZIO: RegraLimiteInput = {
  unidade_id: null,
  dia_semana: null,
  maximo: 1,
  vigencia_inicio: null,
  vigencia_fim: null,
  ativo: true,
  cargo_ids: [],
};

/** Cadastro das regras fixas de quantas pessoas podem folgar por dia. */
export function FolgaLimitesPanel() {
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { regras, isLoading, salvar, excluir, alternarAtivo } = useDpFolgaLimites();

  const [form, setForm] = useState<RegraLimiteInput | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);

  const nomeUnidade = useMemo(
    () => new Map(unidades.map((u: any) => [u.id, u.nome as string])),
    [unidades],
  );
  const nomeCargo = useMemo(
    () => new Map(cargos.map((c: any) => [c.id, c.nome as string])),
    [cargos],
  );

  const set = <K extends keyof RegraLimiteInput>(key: K, value: RegraLimiteInput[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const abrirNova = () => setForm({ ...VAZIO });
  const abrirEdicao = (r: RegraLimiteFolga) =>
    setForm({
      id: r.id,
      unidade_id: r.unidade_id,
      dia_semana: r.dia_semana,
      maximo: r.maximo,
      vigencia_inicio: r.vigencia_inicio,
      vigencia_fim: r.vigencia_fim,
      ativo: r.ativo,
      cargo_ids: [...r.cargo_ids],
    });

  const confirmar = async () => {
    if (!form) return;
    if (!Number.isFinite(form.maximo) || form.maximo < 0) {
      toast.error("Informe quantas pessoas podem folgar (0 ou mais).");
      return;
    }
    if (form.vigencia_inicio && form.vigencia_fim && form.vigencia_fim < form.vigencia_inicio) {
      toast.error("A data final da vigência deve ser depois da inicial.");
      return;
    }
    try {
      await salvar.mutateAsync(form);
      toast.success(form.id ? "Regra atualizada" : "Regra criada");
      setForm(null);
    } catch (e) {
      toast.error("Não foi possível salvar a regra", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Quantas Pessoas Podem Folgar Por Dia</h3>
          <p className="text-xs text-muted-foreground">
            Regras fixas que valem sempre — sem precisar cadastrar dia por dia. A regra mais
            específica (unidade, cargo e dia da semana) vence a mais geral. Um limite lançado para
            uma data específica no calendário é tratado como exceção e vence estas regras.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={abrirNova}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova regra
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando regras...</p>
      ) : regras.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma regra cadastrada: hoje não existe limite de pessoas em folga por dia.
        </div>
      ) : (
        <ul className="space-y-2">
          {regras.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">
                    {resumoRegraLimite(r, {
                      unidade: r.unidade_id ? nomeUnidade.get(r.unidade_id) : null,
                      cargos: r.cargo_ids.map((c) => nomeCargo.get(c) ?? "Cargo"),
                    })}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {(r.vigencia_inicio || r.vigencia_fim) && (
                    <Badge variant="secondary">
                      Vigência {r.vigencia_inicio ?? "—"} a {r.vigencia_fim ?? "sem fim"}
                    </Badge>
                  )}
                  {!r.ativo && <Badge variant="outline">Desativada</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={r.ativo}
                  aria-label="Regra ativa"
                  onCheckedChange={(v) => alternarAtivo.mutate({ id: r.id, ativo: v })}
                />
                <Button variant="ghost" size="sm" onClick={() => abrirEdicao(r)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Excluir regra"
                  onClick={() => setExcluirId(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar Regra" : "Nova Regra De Limite"}</DialogTitle>
            <DialogDescription>
              Defina quantas pessoas podem estar em folga ao mesmo tempo neste recorte.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="limite-unidade">Vale para</Label>
                  <Select
                    value={form.unidade_id ?? "empresa"}
                    onValueChange={(v) => set("unidade_id", v === "empresa" ? null : v)}
                  >
                    <SelectTrigger id="limite-unidade"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empresa">Toda a empresa</SelectItem>
                      {unidades.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="limite-dia">Dia da semana</Label>
                  <Select
                    value={form.dia_semana === null ? "todos" : String(form.dia_semana)}
                    onValueChange={(v) => set("dia_semana", v === "todos" ? null : Number(v))}
                  >
                    <SelectTrigger id="limite-dia"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os dias</SelectItem>
                      {ORDEM_DIAS_SEG_DOM.map((d) => (
                        <SelectItem key={d} value={String(d)}>{DIA_SEMANA_LABEL[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="limite-maximo">Máximo de pessoas em folga</Label>
                  <Input
                    id="limite-maximo"
                    type="number"
                    min={0}
                    value={form.maximo}
                    onChange={(e) => set("maximo", Number(e.target.value))}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
                  <Label htmlFor="limite-ativo" className="text-sm">Regra ativa</Label>
                  <Switch
                    id="limite-ativo"
                    checked={form.ativo}
                    onCheckedChange={(v) => set("ativo", v)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="limite-inicio">Início da vigência (opcional)</Label>
                  <Input
                    id="limite-inicio"
                    type="date"
                    value={form.vigencia_inicio ?? ""}
                    onChange={(e) => set("vigencia_inicio", e.target.value || null)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="limite-fim">Fim da vigência (opcional)</Label>
                  <Input
                    id="limite-fim"
                    type="date"
                    value={form.vigencia_fim ?? ""}
                    onChange={(e) => set("vigencia_fim", e.target.value || null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cargos</Label>
                <p className="text-xs text-muted-foreground">
                  Sem nenhum cargo marcado, a regra vale para qualquer cargo.
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-3">
                  {cargos.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum cargo cadastrado.</p>
                  )}
                  {cargos.map((c: any) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.cargo_ids.includes(c.id)}
                        onCheckedChange={(v) =>
                          set(
                            "cargo_ids",
                            v === true
                              ? [...form.cargo_ids, c.id]
                              : form.cargo_ids.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.nome}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={salvar.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmar()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluirId} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Esta Regra?</AlertDialogTitle>
            <AlertDialogDescription>
              O limite deixa de valer para os dias cobertos por ela. As folgas já lançadas continuam
              como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluir.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!excluirId) return;
                excluir.mutate(excluirId, {
                  onSuccess: () => {
                    toast.success("Regra excluída");
                    setExcluirId(null);
                  },
                  onError: (err) =>
                    toast.error("Erro ao excluir", {
                      description: err instanceof Error ? err.message : "Tente novamente.",
                    }),
                });
              }}
              disabled={excluir.isPending}
            >
              {excluir.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
