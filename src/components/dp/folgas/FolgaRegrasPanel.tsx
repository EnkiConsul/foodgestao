import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users, UserX, Briefcase } from "lucide-react";
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
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpFolgaLimites, type RegraLimiteInput } from "@/hooks/useDpFolgaLimites";
import {
  diasPermitidosParaLimite,
  resumoRegraLimite,
  TIPO_REGRA_LABEL,
  type RegraLimiteFolga,
  type TipoRegraFolga,
} from "@/lib/dp/folga-limites";
import { DIA_SEMANA_LABEL, ORDEM_DIAS_SEG_DOM } from "@/lib/dp/dsr-rules";

const ICONE: Record<TipoRegraFolga, typeof Users> = {
  quantidade: Users,
  cargo: Briefcase,
  colaboradores: UserX,
};

type Props = {
  /** Unidade em edição: toda regra pertence a ela. */
  unidadeId: string | null;
  /** Dias da semana em que existe folga (dias de descanso negociados). */
  diasPermitidos?: number[];
};

/** Cadastro único das regras de folga da unidade: quantidade, cargo e quem não folga junto. */
export function FolgaRegrasPanel({ unidadeId, diasPermitidos }: Props) {
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { data: colaboradores = [] } = useDpColaboradores();
  const { regras, isLoading, salvar, replicar, excluir, alternarAtivo } =
    useDpFolgaLimites(unidadeId);

  const [form, setForm] = useState<RegraLimiteInput | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | TipoRegraFolga>("todas");
  const [replicando, setReplicando] = useState<RegraLimiteFolga | null>(null);
  const [alvos, setAlvos] = useState<string[]>([]);

  const diasDisponiveis = useMemo(() => {
    const dias = diasPermitidosParaLimite(diasPermitidos ?? ORDEM_DIAS_SEG_DOM);
    return dias.length > 0 ? ORDEM_DIAS_SEG_DOM.filter((d) => dias.includes(d)) : [];
  }, [diasPermitidos]);

  const nomeUnidade = useMemo(
    () => new Map(unidades.map((u: { id: string; nome: string }) => [u.id, u.nome])),
    [unidades],
  );
  const nomeCargo = useMemo(
    () => new Map(cargos.map((c: { id: string; nome: string }) => [c.id, c.nome])),
    [cargos],
  );
  const nomeColab = useMemo(
    () => new Map(colaboradores.map((c) => [c.id, c.nome])),
    [colaboradores],
  );

  const ativos = useMemo(
    () => colaboradores.filter((c) => c.ativo !== false),
    [colaboradores],
  );

  const outrasUnidades = useMemo(
    () => unidades.filter((u: { id: string }) => u.id !== unidadeId),
    [unidades, unidadeId],
  );

  const visiveis = useMemo(
    () => (filtro === "todas" ? regras : regras.filter((r) => r.tipo === filtro)),
    [regras, filtro],
  );

  const set = <K extends keyof RegraLimiteInput>(key: K, value: RegraLimiteInput[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const abrirNova = () => {
    if (!unidadeId) {
      toast.error("Escolha a unidade no topo da tela para cadastrar a regra.");
      return;
    }
    setForm({
      tipo: "quantidade",
      nome: null,
      unidade_id: unidadeId,
      dia_semana: diasDisponiveis.length === 1 ? diasDisponiveis[0] : null,
      maximo: 1,
      vigencia_inicio: null,
      vigencia_fim: null,
      ativo: true,
      cargo_ids: [],
      colaborador_ids: [],
    });
  };

  const abrirEdicao = (r: RegraLimiteFolga) =>
    setForm({
      id: r.id,
      tipo: r.tipo,
      nome: r.nome,
      unidade_id: r.unidade_id,
      dia_semana: r.dia_semana,
      maximo: r.maximo,
      vigencia_inicio: r.vigencia_inicio,
      vigencia_fim: r.vigencia_fim,
      ativo: r.ativo,
      cargo_ids: [...r.cargo_ids],
      colaborador_ids: [...r.colaborador_ids],
    });

  const confirmar = async () => {
    if (!form) return;
    if (form.tipo !== "colaboradores" && (!Number.isFinite(form.maximo) || form.maximo < 0)) {
      toast.error("Informe quantas pessoas podem folgar (0 ou mais).");
      return;
    }
    if (form.tipo === "cargo" && form.cargo_ids.length === 0) {
      toast.error("Escolha pelo menos um cargo para esta regra.");
      return;
    }
    if (form.tipo === "colaboradores" && form.colaborador_ids.length < 2) {
      toast.error("Escolha pelo menos duas pessoas que não podem folgar no mesmo dia.");
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

  const confirmarReplicacao = async () => {
    if (!replicando) return;
    try {
      const total = await replicar.mutateAsync({ regra: replicando, unidadeIds: alvos });
      toast.success(
        total === 1 ? "Regra copiada para 1 unidade" : `Regra copiada para ${total} unidades`,
      );
      setReplicando(null);
      setAlvos([]);
    } catch (e) {
      toast.error("Não foi possível replicar a regra", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Particularidade De Folgas</h3>
          <p className="text-xs text-muted-foreground">
            Travas do dia a dia desta unidade: quantas pessoas podem folgar por dia, limite por
            cargo e pessoas que não podem folgar no mesmo dia. Todas valem juntas quando o
            colaborador marca a folga. Um limite lançado para uma data específica no calendário vale
            como exceção. Cada regra pode ser copiada para outras unidades.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={abrirNova}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova regra
        </Button>
      </div>


      <div className="flex flex-wrap gap-2">
        {(["todas", "quantidade", "cargo", "colaboradores"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={filtro === t ? "secondary" : "ghost"}
            onClick={() => setFiltro(t)}
          >
            {t === "todas" ? "Todas" : TIPO_REGRA_LABEL[t]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando regras...</p>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma regra cadastrada aqui: hoje não existe limite para as folgas deste tipo.
        </div>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((r) => {
            const Icone = ICONE[r.tipo] ?? Users;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">
                      {r.nome ||
                        resumoRegraLimite(r, {
                          unidade: r.unidade_id ? nomeUnidade.get(r.unidade_id) : null,
                          cargos: r.cargo_ids.map((c) => nomeCargo.get(c) ?? "Cargo"),
                          colaboradores: r.colaborador_ids.map((c) => nomeColab.get(c) ?? "Pessoa"),
                        })}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{TIPO_REGRA_LABEL[r.tipo]}</Badge>
                    {r.nome && (
                      <span className="truncate">
                        {resumoRegraLimite(r, {
                          unidade: r.unidade_id ? nomeUnidade.get(r.unidade_id) : null,
                          cargos: r.cargo_ids.map((c) => nomeCargo.get(c) ?? "Cargo"),
                          colaboradores: r.colaborador_ids.map((c) => nomeColab.get(c) ?? "Pessoa"),
                        })}
                      </span>
                    )}
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
                  {outrasUnidades.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplicando(r);
                        setAlvos([]);
                      }}
                    >
                      Replicar
                    </Button>
                  )}

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
            );
          })}
        </ul>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar Regra" : "Nova Regra De Folga"}</DialogTitle>
            <DialogDescription>
              Escolha o tipo de regra e o recorte em que ela vale.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="regra-tipo">Tipo de regra</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => set("tipo", v as TipoRegraFolga)}
                >
                  <SelectTrigger id="regra-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quantidade">{TIPO_REGRA_LABEL.quantidade}</SelectItem>
                    <SelectItem value="cargo">{TIPO_REGRA_LABEL.cargo}</SelectItem>
                    <SelectItem value="colaboradores">{TIPO_REGRA_LABEL.colaboradores}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.tipo === "quantidade" &&
                    "Quantas pessoas podem folgar ao mesmo tempo neste dia."}
                  {form.tipo === "cargo" &&
                    "Quantas pessoas de determinados cargos podem folgar ao mesmo tempo."}
                  {form.tipo === "colaboradores" &&
                    "As pessoas escolhidas nunca folgam no mesmo dia."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="regra-nome">Nome da regra (opcional)</Label>
                <Input
                  id="regra-nome"
                  value={form.nome ?? ""}
                  placeholder="Ex.: Cozinha nos sábados"
                  onChange={(e) => set("nome", e.target.value || null)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Esta regra vale para a unidade{" "}
                  <strong>{nomeUnidade.get(form.unidade_id) ?? "selecionada"}</strong>. Depois de
                  salvar você pode copiá-la para outras unidades pelo botão "Replicar".
                </div>



                <div className="space-y-1.5">
                  <Label htmlFor="limite-dia">Dia da semana</Label>
                  <Select
                    value={form.dia_semana === null ? "todos" : String(form.dia_semana)}
                    onValueChange={(v) => set("dia_semana", v === "todos" ? null : Number(v))}
                  >
                    <SelectTrigger id="limite-dia"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os dias de folga</SelectItem>
                      {diasDisponiveis.map((d) => (
                        <SelectItem key={d} value={String(d)}>{DIA_SEMANA_LABEL[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Só aparecem os dias marcados como dias de descanso.
                  </p>
                </div>

                {form.tipo !== "colaboradores" && (
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
                )}

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

              {form.tipo === "cargo" && (
                <div className="space-y-2">
                  <Label>Cargos</Label>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-3">
                    {cargos.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum cargo cadastrado.</p>
                    )}
                    {cargos.map((c: { id: string; nome: string }) => (
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
              )}

              {form.tipo === "colaboradores" && (
                <div className="space-y-2">
                  <Label>Pessoas que não podem folgar no mesmo dia</Label>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border p-3">
                    {ativos.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma pessoa cadastrada.</p>
                    )}
                    {ativos.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.colaborador_ids.includes(c.id)}
                          onCheckedChange={(v) =>
                            set(
                              "colaborador_ids",
                              v === true
                                ? [...form.colaborador_ids, c.id]
                                : form.colaborador_ids.filter((id) => id !== c.id),
                            )
                          }
                        />
                        <span className="truncate">
                          {c.nome}
                          {c.cargo_nome ? ` — ${c.cargo_nome}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
              A regra deixa de valer para os próximos dias. As folgas já lançadas continuam como
              estão.
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
