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
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
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
  (c.regime ? contratoPolicy(c.regime).label : null) ??
  "—";

const PERFIL_LABEL: Record<string, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  admin: "Admin",
};

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" className="rounded-full" asChild>
              <Link to="/dp/colaboradores/lixeira">
                <Trash2 className="h-4 w-4 mr-2" /> Lixeira
              </Link>
            </Button>
            <Button
              size="lg"
              className="rounded-full font-semibold"
              onClick={() => abrirCadastro(null)}
            >
              <Plus className="h-5 w-5 mr-2" /> Novo Colaborador
            </Button>
          </div>
        }
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="ativos">Ativos ({counts.ativos})</TabsTrigger>
          <TabsTrigger value="desligados">Desligados ({counts.desligados})</TabsTrigger>
        </TabsList>
      </Tabs>

      <DpFilterCard>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground">BUSCAR</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome ou CPF..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground">UNIDADE</label>
              <Select value={unidadeFilter} onValueChange={setUnidadeFilter}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(unidades.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground">CARGO</label>
              <Select value={cargoFilter} onValueChange={setCargoFilter}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(cargos.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wider text-muted-foreground">PERFIL</label>
              <Select value={perfilFilter} onValueChange={setPerfilFilter}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
      </DpFilterCard>

      <DpContentCard contentClassName="hidden md:block">
          {list.isLoading ? (
            <TableSkeleton
              columns={6}
              headers={["Colaborador", "Cargo", "Unidade", "Status", "Perfil", ""]}
            />
          ) : (
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="uppercase text-xs tracking-wider w-[26%]">Colaborador</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider w-[16%]">Cargo</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider w-[16%]">Unidade</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider w-[20%]">Status</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider w-[12%]">Perfil</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider text-right w-[10%]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const perfil = (c as any).perfil_acesso as string | null;
                  const folha = (c as any).possui_folha_ponto as boolean | null;
                  const adiantamento = (c as any).optante_adiantamento as boolean | null;
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setViewing(c)}
                    >
                      <TableCell className="align-top">
                        <div className="font-semibold uppercase truncate" title={c.nome}>{c.nome}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{c.cpf ?? "—"}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase border-primary/30 text-primary bg-primary/5">
                            {vinculoLabel(c as any)}
                          </Badge>
                          {folha && (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">Ponto</Badge>
                          )}
                          {adiantamento && (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">Adiantamento</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top truncate" title={c.cargo_nome ?? c.cargo ?? ""}>
                        {c.cargo_nome ?? c.cargo ?? "—"}
                      </TableCell>
                      <TableCell className="align-top truncate" title={c.unidade_nome ?? ""}>
                        {c.unidade_nome ?? "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        {c.ativo ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
                            Ativo
                          </Badge>
                        ) : (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                              Desligado em {fmtDate(c.data_desligamento)}
                            </Badge>
                            <div className="text-[11px] text-muted-foreground">
                              {(c as any).motivo_desligamento
                                ? MOTIVO_DESLIGAMENTO_LABEL[(c as any).motivo_desligamento as keyof typeof MOTIVO_DESLIGAMENTO_LABEL]
                                : "Motivo não informado"}
                              {(c as any).elegivel_recontratacao
                                ? ` • ${ELEGIBILIDADE_LABEL[(c as any).elegivel_recontratacao as keyof typeof ELEGIBILIDADE_LABEL]}`
                                : ""}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {acessoPortalAtivo((c as any).acesso_portal_ate)
                                ? `Portal até ${fmtDate((c as any).acesso_portal_ate)} (${diasRestantesCarencia((c as any).acesso_portal_ate)} d)`
                                : "Portal encerrado"}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
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
                      </TableCell>
                      <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-0.5 justify-end">
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
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum colaborador encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
