import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users, UserX, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  partesRegraLimite,
  resumoRegraLimite,
  TIPO_REGRA_LABEL,
  type RegraLimiteFolga,
  type TipoRegraFolga,
} from "@/lib/dp/folga-limites";
import { DIA_SEMANA_LABEL, ORDEM_DIAS_SEG_DOM } from "@/lib/dp/dsr-rules";

/** Regra vinda do banco ou em rascunho no formulário de unidade. */
type RegraVisivel = RegraLimiteFolga | RegraLimiteInput;

const chaveRegra = (r: RegraVisivel) => ("clientId" in r && r.clientId ? r.clientId : r.id);

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
  /**
   * `direto` (padrão): grava no banco a cada operação.
   * `rascunho`: mantém as regras em memória e avisa o pai via `onChangeRascunho`.
   */
  modo?: "direto" | "rascunho";
  /** Regras em rascunho — obrigatório quando modo = "rascunho". */
  regrasRascunho?: RegraLimiteInput[];
  /** Chamado a cada alteração no modo rascunho. */
  onChangeRascunho?: (regras: RegraLimiteInput[]) => void;
};


/** Cadastro único das regras de folga da unidade: quantidade, cargo e quem não folga junto. */
export function FolgaRegrasPanel({
  unidadeId,
  diasPermitidos,
  modo = "direto",
  regrasRascunho = [],
  onChangeRascunho,
}: Props) {
  const { data: unidades = [] } = useDpUnidades();
  const { data: cargos = [] } = useDpCargos();
  const { data: colaboradores = [] } = useDpColaboradores();
  const hook = useDpFolgaLimites(unidadeId);
  const {
    regras: regrasDoBanco,
    isLoading: isLoadingDoBanco,
    salvar,
    replicar,
    excluir,
    alternarAtivo,
  } = hook;

  const rascunho = modo === "rascunho";
  const regras = rascunho ? regrasRascunho : regrasDoBanco;
  const isLoading = rascunho ? false : isLoadingDoBanco;


  const [form, setForm] = useState<RegraLimiteInput | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | TipoRegraFolga>("todas");
  const [replicando, setReplicando] = useState<RegraVisivel | null>(null);
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

  const abrirEdicao = (r: RegraVisivel) =>
    setForm({
      clientId: "clientId" in r ? r.clientId : undefined,
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
    if (rascunho) {
      if (!onChangeRascunho) return;
      const chave = form.clientId ?? form.id;
      const nova = chave
        ? regrasRascunho.map((r) => (r.clientId === chave || r.id === chave ? form : r))
        : [...regrasRascunho, { ...form, clientId: form.clientId ?? crypto.randomUUID() }];
      onChangeRascunho(nova);
      toast.success(form.id ? "Regra atualizada no rascunho" : "Regra incluída no rascunho");
      setForm(null);
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


      <ToggleGroup
        type="single"
        value={filtro}
        onValueChange={(v) => v && setFiltro(v as "todas" | TipoRegraFolga)}
        className="flex w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1"
      >
        {(["todas", "quantidade", "cargo", "colaboradores"] as const).map((t) => (
          <ToggleGroupItem
            key={t}
            value={t}
            className="h-8 rounded-md px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            {t === "todas" ? "Todas" : TIPO_REGRA_LABEL[t]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando regras...</p>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma regra cadastrada aqui: hoje não existe limite para as folgas deste tipo.
        </div>
      ) : (
        <ul className="space-y-3">
          {visiveis.map((r) => {
            const Icone = ICONE[r.tipo] ?? Users;
            const chave = chaveRegra(r);
            const partes = partesRegraLimite(r, {
              cargos: r.cargo_ids.map((c) => nomeCargo.get(c) ?? "Cargo"),
              colaboradores: r.colaborador_ids.map((c) => nomeColab.get(c) ?? "Pessoa"),
            });
            return (
              <li key={chave} className="rounded-xl border p-3 transition-colors hover:bg-muted/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icone className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <Badge variant="secondary">{TIPO_REGRA_LABEL[r.tipo]}</Badge>
                    {!r.ativo && <Badge variant="outline">Desativada</Badge>}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={r.ativo}
                      aria-label="Regra ativa"
                      onCheckedChange={(v) => {
                        if (rascunho) {
                          onChangeRascunho?.(
                            regrasRascunho.map((item) =>
                              (item.clientId ?? item.id) === chave ? { ...item, ativo: v } : item,
                            ),
                          );
                        } else {
                          alternarAtivo.mutate({ id: r.id, ativo: v });
                        }
                      }}
                    />
                    <Button variant="ghost" size="sm" onClick={() => abrirEdicao(r)}>
                      Editar
                    </Button>
                    {!rascunho && outrasUnidades.length > 0 && (
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
                      onClick={() => setExcluirId(chave)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 space-y-1.5 pl-9">
                  {r.nome && <p className="text-sm font-medium">{r.nome}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium capitalize text-foreground">{partes.dia}</span>
                    <span aria-hidden="true">·</span>
                    {partes.escopo.length === 0 ? (
                      <span>{partes.escopoVazio}</span>
                    ) : (
                      partes.escopo.map((nome) => (
                        <Badge key={nome} variant="outline" className="font-normal">
                          {nome}
                        </Badge>
                      ))
                    )}
                    {(r.vigencia_inicio || r.vigencia_fim) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Vigência {r.vigencia_inicio ?? "—"} a {r.vigencia_fim ?? "sem fim"}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold">{partes.limite}</p>
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
                    "Quantas pessoas podem folgar ao mesmo tempo neste dia — com a opção de contar só alguns cargos."}
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

              {(form.tipo === "cargo" || form.tipo === "quantidade") && (
                <div className="space-y-2">
                  <Label>
                    Cargos{form.tipo === "quantidade" ? " (opcional)" : ""}
                  </Label>
                  {form.tipo === "quantidade" && (
                    <p className="text-xs text-muted-foreground">
                      Sem cargo marcado, a regra vale para todos os cargos da unidade. Com cargos
                      marcados, a contagem de pessoas em folga vale só para esses cargos.
                    </p>
                  )}
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
              {rascunho
                ? "Salvar no rascunho"
                : salvar.isPending
                  ? "Salvando..."
                  : "Salvar regra"}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <Dialog
        open={!!replicando}
        onOpenChange={(o) => {
          if (!o) {
            setReplicando(null);
            setAlvos([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Replicar Regra Para Outras Unidades</DialogTitle>
            <DialogDescription>
              Uma cópia independente da regra é criada em cada unidade marcada. Editar uma delas
              depois não altera as outras.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAlvos(outrasUnidades.map((u: { id: string }) => u.id))}
              >
                Selecionar todas
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAlvos([])}>
                Limpar seleção
              </Button>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border p-3">
              {outrasUnidades.length === 0 && (
                <p className="text-xs text-muted-foreground">Não há outras unidades cadastradas.</p>
              )}
              {outrasUnidades.map((u: { id: string; nome: string }) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={alvos.includes(u.id)}
                    onCheckedChange={(v) =>
                      setAlvos((prev) =>
                        v === true ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                      )
                    }
                  />
                  {u.nome}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReplicando(null);
                setAlvos([]);
              }}
              disabled={replicar.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmarReplicacao()}
              disabled={replicar.isPending || alvos.length === 0}
            >
              {replicar.isPending ? "Replicando..." : `Replicar em ${alvos.length} unidade(s)`}
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
            <AlertDialogCancel disabled={rascunho ? false : excluir.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!excluirId) return;
                if (rascunho) {
                  onChangeRascunho?.(
                    regrasRascunho.filter((item) => (item.clientId ?? item.id) !== excluirId),
                  );
                  toast.success("Regra removida do rascunho");
                  setExcluirId(null);
                  return;
                }
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
              disabled={rascunho ? false : excluir.isPending}
            >
              {rascunho ? "Excluir" : excluir.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
