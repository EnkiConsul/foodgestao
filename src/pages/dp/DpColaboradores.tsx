import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, Search, KeyRound, UserPlus, Copy, Check, Lock, Eye, EyeOff, Sparkles, UserMinus, RotateCcw, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  useDpColaboradores, useDeleteDpColaborador, useReintegrarDpColaborador,
  type DpColaborador,
} from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { MotivoDialog } from "@/components/dp/MotivoDialog";
import { Link } from "react-router-dom";
import { ColaboradorFichaDialog } from "@/components/dp/ColaboradorFichaDialog";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpFilters, DpFilterField } from "@/components/dp/DpFilters";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
import { supabase } from "@/integrations/supabase/client";
import { contratoPolicy } from "@/lib/dp/contrato-policy";
import { MOTIVO_DESLIGAMENTO_LABEL, ELEGIBILIDADE_LABEL, acessoPortalAtivo, diasRestantesCarencia } from "@/lib/dp/desligamento";

const fmtDate = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");


// Rótulo do vínculo: usa o escolhido no cadastro (Sócio/PJ) e cai na política do contrato.
const VINCULO_LABEL: Record<string, string> = {
  CLT: "CLT efetivo",
  Intermitente: "CLT intermitente",
  Estagiario: "Estagiário",
  Temporario: "Temporário",
  PJ: "PJ",
  Socio: "Sócio",
  Freelancer: "Freelancer (sem registro)",
};

const vinculoLabel = (c: { regime?: string | null; vinculo_label?: string | null }): string =>
  (c.vinculo_label ? VINCULO_LABEL[c.vinculo_label] : null) ??
  (c.regime ? contratoPolicy(c.regime, c.vinculo_label).label : null) ??
  "—";

const PERFIL_LABEL: Record<string, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  admin: "Admin",
};

type ColabColKey = "colaborador" | "cargo" | "unidade" | "status" | "perfil";
type ColabSortKey = "padrao" | "nome" | "cargo" | "unidade" | "status" | "perfil";

const DEFAULT_COLAB_COL_ORDER: ColabColKey[] = ["colaborador", "cargo", "unidade", "status", "perfil"];
/** Larguras padrão em px (somam ~980 + 96 de ações). */
const DEFAULT_COLAB_COL_WIDTHS: Record<ColabColKey, number> = {
  colaborador: 280,
  cargo: 170,
  unidade: 170,
  status: 240,
  perfil: 120,
};
const COLAB_ACOES_WIDTH = 96;


export default function DpColaboradores() {
  const list = useDpColaboradores();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const del = useDeleteDpColaborador();
  const reintegrar = useReintegrarDpColaborador();

  const [search, setSearch] = useState("");
  const [unidadeFilter, setUnidadeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cargoFilter, setCargoFilter] = useState<string>("all");
  const [perfilFilter, setPerfilFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<DpColaborador | null>(null);
  const [editing, setEditing] = useState<DpColaborador | null>(null);
  /** Aba aberta ao abrir o cadastro pelas ações da lista. */
  const [abaInicial, setAbaInicial] = useState<"dados" | "acesso" | "desligamento">("dados");
  const abrirCadastro = (c: DpColaborador | null, aba: "dados" | "acesso" | "desligamento" = "dados") => {
    setEditing(c);
    setAbaInicial(aba);
    setDialogOpen(true);
  };
  const [toDelete, setToDelete] = useState<DpColaborador | null>(null);

  const counts = useMemo(() => {
    const all = list.data ?? [];
    return {
      todos: all.length,
      ativos: all.filter((c) => c.ativo).length,
      desligados: all.filter((c) => !c.ativo).length,
    };
  }, [list.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? [])
      .filter((c) => {
        if (q) {
          const hit =
            c.nome.toLowerCase().includes(q) ||
            (c.cpf ?? "").toLowerCase().includes(q) ||
            (c.matricula ?? "").toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (unidadeFilter !== "all" && c.unidade_id !== unidadeFilter) return false;
        if (cargoFilter !== "all" && c.cargo_id !== cargoFilter) return false;
        if (perfilFilter !== "all" && (c as any).perfil_acesso !== perfilFilter) return false;
        if (statusFilter === "ativos" && !c.ativo) return false;
        if (statusFilter === "desligados" && c.ativo) return false;
        return true;
      })
      .sort((a, b) => {
        const perfilDestaca = (p: string | null) => p === "admin" || p === "gestor";
        const ga = a.ativo ? (perfilDestaca((a as any).perfil_acesso) ? 0 : 1) : 2;
        const gb = b.ativo ? (perfilDestaca((b as any).perfil_acesso) ? 0 : 1) : 2;
        if (ga !== gb) return ga - gb;
        if (ga < 2) {
          const ua = a.unidade_id ?? "zzzz";
          const ub = b.unidade_id ?? "zzzz";
          if (ua !== ub) return ua.localeCompare(ub);
        }
        return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      });
  }, [list.data, search, unidadeFilter, cargoFilter, perfilFilter, statusFilter]);

  // ---------- Colunas em formato de planilha (ordem, largura, ordenação e filtros) ----------
  const {
    colOrder, colWidths, resize, resetWidth,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
  } = useDpTableColumns<ColabColKey, ColabSortKey>({
    storageKey: "dp_colabs_col",
    defaultOrder: DEFAULT_COLAB_COL_ORDER,
    defaultWidths: DEFAULT_COLAB_COL_WIDTHS,
    acoesWidth: COLAB_ACOES_WIDTH,
    defaultSortKey: "padrao",
  });

  const COLS: Record<ColabColKey, {
    label: string;
    sortKey: ColabSortKey;
    /** Colunas centralizadas (todas, exceto Colaborador). */
    center?: boolean;
    value: (c: DpColaborador) => string;
    render: (c: DpColaborador) => JSX.Element;
  }> = {
    colaborador: {
      label: "Colaborador", sortKey: "nome",
      value: (c) => c.nome,
      render: (c) => {
        const folha = (c as any).possui_folha_ponto as boolean | null;
        const adiantamento = (c as any).optante_adiantamento as boolean | null;
        return (
          <>
            <div className="font-semibold uppercase truncate" title={c.nome}>{c.nome}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{c.cpf ?? "—"}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase border-primary/30 text-primary bg-primary/5">
                {vinculoLabel(c as any)}
              </Badge>
              {folha && <Badge variant="outline" className="h-4 px-1 text-[10px]">Ponto</Badge>}
              {adiantamento && <Badge variant="outline" className="h-4 px-1 text-[10px]">Adiantamento</Badge>}
            </div>
          </>
        );
      },
    },
    cargo: {
      label: "Cargo", sortKey: "cargo", center: true,
      value: (c) => c.cargo_nome ?? c.cargo ?? "—",
      render: (c) => (
        <span className="block truncate text-center" title={c.cargo_nome ?? c.cargo ?? ""}>
          {c.cargo_nome ?? c.cargo ?? "—"}
        </span>
      ),
    },
    unidade: {
      label: "Unidade", sortKey: "unidade", center: true,
      value: (c) => c.unidade_nome ?? "—",
      render: (c) => (
        <span className="block whitespace-normal break-words text-center" title={c.unidade_nome ?? ""}>
          {c.unidade_nome ?? "—"}
        </span>
      ),
    },
    status: {
      label: "Status", sortKey: "status", center: true,
      value: (c) => (c.ativo ? "Ativo" : "Desligado"),
      render: (c) => (c.ativo ? (
        <div className="text-center">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
            Ativo
          </Badge>
        </div>
      ) : (
        <div className="space-y-0.5 text-center">
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 whitespace-normal leading-tight">
            Desligado em {fmtDate(c.data_desligamento)}
          </Badge>
          <div className="text-[11px] text-muted-foreground">
            {acessoPortalAtivo((c as any).acesso_portal_ate)
              ? `Portal até ${fmtDate((c as any).acesso_portal_ate)} (${diasRestantesCarencia((c as any).acesso_portal_ate)} d)`
              : "Portal encerrado"}
          </div>
        </div>
      )),
    },

    perfil: {
      label: "Perfil", sortKey: "perfil", center: true,
      value: (c) => PERFIL_LABEL[((c as any).perfil_acesso as string | null) ?? "colaborador"],
      render: (c) => {
        const perfil = (c as any).perfil_acesso as string | null;
        return (
          <div className="text-center">
            <Badge
              variant="outline"
              className={
                perfil === "admin" ? "bg-destructive/10 text-destructive border-destructive/30"
                : perfil === "gestor" ? "bg-primary/10 text-primary border-primary/30"
                : ""
              }
            >
              {PERFIL_LABEL[perfil ?? "colaborador"]}
            </Badge>
          </div>
        );
      },

    },
  };

  /** Aplica os filtros por valor de cada coluna sobre a lista já filtrada no topo. */
  const filtradoPorColuna = useMemo(() => {
    return filtered.filter((c) =>
      (Object.keys(colFilters) as ColabColKey[]).every((k) => {
        const sel = colFilters[k] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[k].value(c));
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, colFilters]);

  /** Opções de filtro de uma coluna considerando os filtros das demais. */
  const opcoesColuna = (k: ColabColKey) => {
    const outros = filtered.filter((c) =>
      (Object.keys(colFilters) as ColabColKey[]).every((other) => {
        if (other === k) return true;
        const sel = colFilters[other] ?? [];
        if (!sel.length) return true;
        return sel.includes(COLS[other].value(c));
      }),
    );
    const set = new Set<string>();
    outros.forEach((c) => set.add(COLS[k].value(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  /** Ordenação escolhida no cabeçalho; "padrao" mantém o agrupamento original. */
  const visiveis = useMemo(() => {
    if (sortKey === "padrao") return filtradoPorColuna;
    const col = (Object.keys(COLS) as ColabColKey[]).find((k) => COLS[k].sortKey === sortKey);
    if (!col) return filtradoPorColuna;
    const arr = [...filtradoPorColuna];
    arr.sort((a, b) => {
      const cmp = COLS[col].value(a).localeCompare(COLS[col].value(b), "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradoPorColuna, sortKey, sortDir]);

  const handleDelete = async (motivo: string) => {
    if (!toDelete) return;
    try {
      await del.mutateAsync({ id: toDelete.id, motivo });
      toast.success("Cadastro movido para a lixeira");
    } catch (e) {
      toast.error("Erro ao excluir", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };



  return (
    <DpPage>
      <Helmet><title>Colaboradores — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Users}
        title="Colaboradores"
        description="Gerencie a equipe, cargos e acessos ao sistema."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-10 rounded-full sm:size-lg" asChild>
              <Link to="/dp/colaboradores/lixeira">
                <Trash2 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Lixeira</span>
              </Link>
            </Button>
            <Button
              size="sm"
              className="h-10 rounded-full font-semibold sm:size-lg"
              onClick={() => abrirCadastro(null)}
            >
              <Plus className="h-4 w-4 mr-1.5 sm:h-5 sm:w-5 sm:mr-2" /> Novo
              <span className="hidden sm:inline">&nbsp;Colaborador</span>
            </Button>
          </>
        }
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <DpTabsBar>
          <TabsTrigger value="all">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="ativos">Ativos ({counts.ativos})</TabsTrigger>
          <TabsTrigger value="desligados">Desligados ({counts.desligados})</TabsTrigger>
        </DpTabsBar>
      </Tabs>

      <DpFilters
        search={{ value: search, onChange: setSearch, placeholder: "Nome ou CPF..." }}
        activeCount={
          (unidadeFilter !== "all" ? 1 : 0) + (cargoFilter !== "all" ? 1 : 0) + (perfilFilter !== "all" ? 1 : 0)
        }
        onClear={() => { setUnidadeFilter("all"); setCargoFilter("all"); setPerfilFilter("all"); }}
      >
        <DpFilterField label="Unidade">
          <Select value={unidadeFilter} onValueChange={setUnidadeFilter}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(unidades.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Cargo">
          <Select value={cargoFilter} onValueChange={setCargoFilter}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(cargos.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>
        <DpFilterField label="Perfil">
          <Select value={perfilFilter} onValueChange={setPerfilFilter}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="colaborador">Colaborador</SelectItem>
              <SelectItem value="gestor">Gestor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </DpFilterField>
      </DpFilters>

      <DpContentCard contentClassName="hidden md:block">
          {list.isLoading ? (
            <TableSkeleton
              columns={6}
              headers={["Colaborador", "Cargo", "Unidade", "Status", "Perfil", ""]}
            />
          ) : (
            <div className="w-full overflow-x-auto">
            <Table className="table-fixed" style={{ width: "100%", minWidth: larguraTotal }}>
              <TableHeader>
                <TableRow>
                  {colOrder.map((k) => (
                    <DpTableColumnHeader
                      key={k}
                      label={COLS[k].label}
                      width={colWidths[k]}
                      center={COLS[k].center}
                      sortAtivo={sortKey === COLS[k].sortKey}
                      sortDir={sortDir}
                      onSort={(dir) => aplicarSort(COLS[k].sortKey, dir)}
                      ativos={colFilters[k]}
                      getOpcoes={() => opcoesColuna(k)}
                      onToggle={(v) => toggleColValue(k, v)}
                      onSelecionarTodos={() => setColFilters((p) => ({ ...p, [k]: opcoesColuna(k) }))}
                      onLimpar={() => setColFilters((p) => ({ ...p, [k]: [] }))}
                      arrastando={dragCol === k}
                      onDragStart={() => setDragCol(k)}
                      onDrop={() => soltarSobre(k)}
                      onDragEnd={() => setDragCol(null)}
                      onResize={(largura) => resize(k, largura)}
                      onResetWidth={() => resetWidth(k)}
                    />
                  ))}
                  <TableHead
                    className="uppercase text-xs tracking-wider text-center"
                    style={{ width: COLAB_ACOES_WIDTH }}
                  >
                    Ações
                  </TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setViewing(c)}
                  >
                    {colOrder.map((k) => (
                      <TableCell
                        key={k}
                        className="align-top overflow-hidden"
                        style={{ width: colWidths[k], maxWidth: colWidths[k] }}
                      >
                        {COLS[k].render(c)}
                      </TableCell>
                    ))}
                    <TableCell className="align-top" style={{ width: COLAB_ACOES_WIDTH }} onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-0.5 justify-center">

                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); abrirCadastro(c); }} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Mais ações">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onSelect={() => abrirCadastro(c, "acesso")}>
                              {c.user_id ? <KeyRound className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                              {c.user_id ? "Acesso e senha do portal" : "Gerar acesso ao portal"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => abrirCadastro(c, "desligamento")}>
                              {c.ativo ? (
                                <><UserMinus className="h-4 w-4 mr-2 text-destructive" /> Registrar desligamento</>
                              ) : (
                                <><RotateCcw className="h-4 w-4 mr-2" /> Desligamento / reintegração</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setToDelete(c)}>
                              <Trash2 className="h-4 w-4 mr-2 text-destructive" /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={colOrder.length + 1} className="text-center text-muted-foreground py-8">
                      Nenhum colaborador encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          )}
      </DpContentCard>



      {/* Mobile: lista de cards */}
      <div className="md:hidden space-y-3">
        {list.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        )}
        {!list.isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum colaborador encontrado.
          </div>
        )}
        {!list.isLoading && filtered.map((c) => {
          const perfil = (c as any).perfil_acesso as string | null;
          const folha = (c as any).possui_folha_ponto as boolean | null;
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-4 space-y-3 active:scale-[0.98] transition-transform">
              <div className="cursor-pointer" onClick={() => setViewing(c)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold uppercase truncate">{c.nome}</div>
                    <div className="font-mono text-xs text-muted-foreground mt-0.5">{c.cpf ?? "—"}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {c.cargo_nome ?? c.cargo ?? "—"}
                      {c.unidade_nome ? <span> • {c.unidade_nome}</span> : null}
                    </div>
                  </div>
                  {c.ativo ? (
                    <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] bg-destructive/10 text-destructive border-destructive/30">
                      Desligado {fmtDate(c.data_desligamento)}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge variant="outline" className="uppercase border-primary/30 text-primary bg-primary/5 text-[11px]">
                    {vinculoLabel(c as any)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      "text-[11px] " + (perfil === "admin" ? "bg-destructive/10 text-destructive border-destructive/30"
                      : perfil === "gestor" ? "bg-primary/10 text-primary border-primary/30"
                      : "")
                    }
                  >
                    {PERFIL_LABEL[perfil ?? "colaborador"]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={"text-[11px] " + (folha
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
                      : "text-muted-foreground")}
                  >
                    Folha: {folha ? "Sim" : "Não"}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 pt-1 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => abrirCadastro(c)}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => abrirCadastro(c, "acesso")}>
                  {c.user_id ? <KeyRound className="h-4 w-4 mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />} Acesso
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`min-h-11 flex-1 ${c.ativo ? "text-destructive" : ""}`}
                  onClick={() => abrirCadastro(c, "desligamento")}
                >
                  {c.ativo ? <UserMinus className="h-4 w-4 mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                  {c.ativo ? "Desligar" : "Reintegrar"}
                </Button>
                <Button size="icon" variant="ghost" className="min-h-11 min-w-11" onClick={() => setToDelete(c)} title="Remover">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>


      {viewing && (
        <ColaboradorFichaDialog
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          colaborador={viewing}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
            setDialogOpen(true);
          }}
        />
      )}

      

      <ColaboradorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        colaborador={editing}
        abaInicial={abaInicial}
      />





      <MotivoDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir colaborador?"
        description={`${toDelete?.nome ?? "O cadastro"} vai para a lixeira e pode ser restaurado por 7 dias.`}
        label="Justificativa da exclusão"
        confirmLabel="Excluir cadastro"
        loading={del.isPending}
        onConfirm={handleDelete}
      />


    </DpPage>
  );
}
