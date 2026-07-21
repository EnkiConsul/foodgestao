import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, Search, KeyRound, UserPlus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  useDpColaboradores, useDeleteDpColaborador, useToggleDpColaboradorAtivo,
  type DpColaborador,
} from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { supabase } from "@/integrations/supabase/client";

const REGIME_LABEL: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estagiário",
  temporario: "Temporário",
  mei: "MEI",
};

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
  const toggle = useToggleDpColaboradorAtivo();

  const [search, setSearch] = useState("");
  const [unidadeFilter, setUnidadeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cargoFilter, setCargoFilter] = useState<string>("all");
  const [perfilFilter, setPerfilFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DpColaborador | null>(null);
  const [toDelete, setToDelete] = useState<DpColaborador | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [accessResult, setAccessResult] = useState<{ nome: string; cpf: string; password: string; kind: "created" | "reset" } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const counts = useMemo(() => {
    const all = list.data ?? [];
    return {
      todos: all.length,
      ativos: all.filter((c) => c.ativo).length,
      inativos: all.filter((c) => !c.ativo).length,
    };
  }, [list.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((c) => {
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
      if (statusFilter === "inativos" && c.ativo) return false;
      return true;
    });
  }, [list.data, search, unidadeFilter, cargoFilter, perfilFilter, statusFilter]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Colaborador removido");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };

  const handleToggle = async (c: DpColaborador, ativo: boolean) => {
    try {
      await toggle.mutateAsync({ id: c.id, ativo });
      toast.success(ativo ? "Colaborador ativado" : "Colaborador inativado");
    } catch (e) {
      toast.error("Erro ao atualizar status", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleReset = async (c: DpColaborador) => {
    if (!c.user_id) {
      toast.error("Colaborador não possui usuário vinculado ao portal");
      return;
    }
    setResetting(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("dp-reset-password", {
        body: { colaborador_id: c.id },
      });
      if (error) throw error;
      const pwd = (data as any)?.password as string | undefined;
      if (pwd) {
        setAccessResult({
          nome: c.nome,
          cpf: c.cpf ?? "",
          password: pwd,
          kind: "reset",
        });
      } else {
        toast.success("Senha redefinida");
      }
    } catch (e) {
      toast.error("Erro ao redefinir senha", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setResetting(null);
    }
  };

  const handleGrantAccess = async (c: DpColaborador) => {
    if (c.user_id) {
      toast.error("Colaborador já possui acesso — use Resetar senha para gerar nova.");
      return;
    }
    if (!c.cpf || c.cpf.replace(/\D/g, "").length !== 11) {
      toast.error("CPF inválido — complete o cadastro (11 dígitos) antes de gerar o acesso.");
      return;
    }
    setGranting(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("dp-criar-acesso-colaborador", {
        body: { colaborador_id: c.id },
      });
      if (error) throw error;
      const payload = data as { password?: string; cpf?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (payload?.password && payload?.cpf) {
        setAccessResult({
          nome: c.nome,
          cpf: payload.cpf,
          password: payload.password,
          kind: "created",
        });
        await list.refetch?.();
      }
    } catch (e) {
      toast.error("Erro ao gerar acesso", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGranting(null);
    }
  };

  const copyToClipboard = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((v) => (v === label ? null : v)), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <DpPage>
      <Helmet><title>Colaboradores — DP 360°</title></Helmet>

      <DpPageHeader
        icon={Users}
        title="Colaboradores"
        description="Gerencie a equipe, cargos e acessos ao sistema."
        actions={
          <>
          <Button
            size="lg"
            className="rounded-full font-semibold"
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            <Plus className="h-5 w-5 mr-2" /> Novo Colaborador
          </Button>
          </>
        }
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos ({counts.todos})</TabsTrigger>
          <TabsTrigger value="ativos">Ativos ({counts.ativos})</TabsTrigger>
          <TabsTrigger value="inativos">Inativos ({counts.inativos})</TabsTrigger>
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

      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton
              columns={9}
              headers={["Colaborador", "CPF", "Cargo", "Unidade", "Vínculo", "Status", "Perfil", "Folha Ponto", ""]}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="uppercase text-xs tracking-wider">Colaborador</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">CPF</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">Cargo</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">Unidade</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">Vínculo</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">Status</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">Perfil</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider">Folha Ponto</TableHead>
                  <TableHead className="uppercase text-xs tracking-wider text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const perfil = (c as any).perfil_acesso as string | null;
                  const folha = (c as any).possui_folha_ponto as boolean | null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold uppercase">{c.nome}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.cpf ?? "—"}</TableCell>
                      <TableCell>{c.cargo_nome ?? c.cargo ?? "—"}</TableCell>
                      <TableCell>{c.unidade_nome ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase border-primary/30 text-primary bg-primary/5">
                          {REGIME_LABEL[c.regime ?? ""] ?? c.regime ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={!!c.ativo}
                          onCheckedChange={(v) => handleToggle(c, v)}
                          disabled={toggle.isPending}
                        />
                      </TableCell>
                      <TableCell>
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
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={folha
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
                            : "text-muted-foreground"}
                        >
                          {folha ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setDialogOpen(true); }} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={c.user_id ? "Resetar senha para 6 últimos do CPF" : "Sem usuário vinculado"}
                            disabled={!c.user_id || resetting === c.id}
                            onClick={() => handleReset(c)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setToDelete(c)} title="Remover">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Nenhum colaborador encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      <ColaboradorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} colaborador={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto também remove todas as solicitações e documentos vinculados a <strong>{toDelete?.nome}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
