import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpFilters } from "@/components/dp/DpFilters";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  useDpPessoasApoio, useExcluirDpPessoaApoio, useSalvarDpPessoaApoio,
  type PessoaApoio, type PessoaApoioTipo,
} from "@/hooks/useDpPessoasApoio";
import { pessoaApoioSchema, validateWithToast } from "@/lib/validations";

const TIPO_LABEL: Record<PessoaApoioTipo, string> = {
  folguista: "Folguista",
  teste: "Em teste",
};

const vazio = {
  nome: "",
  telefone: "",
  tipo: "folguista" as PessoaApoioTipo,
  cargo_id: "",
  unidade_id: "",
  cpf: "",
  genero: "",
  data_nascimento: "",
  observacao: "",
  ativo: true,
};

/**
 * Banco de folguistas e pessoas em teste: quem já trabalhou eventualmente na
 * operação e pode ser chamado de novo, sem cadastro completo de colaborador.
 */
export default function DpPessoasApoio() {
  const lista = useDpPessoasApoio();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const salvar = useSalvarDpPessoaApoio();
  const excluir = useExcluirDpPessoaApoio();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<PessoaApoio | null>(null);
  const [form, setForm] = useState(vazio);
  const [aExcluir, setAExcluir] = useState<PessoaApoio | null>(null);

  const nomeCargo = (id: string | null) => (cargos.data ?? []).find((c) => c.id === id)?.nome ?? "—";
  const nomeUnidade = (id: string | null) => (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "—";

  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lista.data ?? []).filter(
      (p) => !q || p.nome.toLowerCase().includes(q) || (p.telefone ?? "").includes(q),
    );
  }, [lista.data, search]);

  const abrir = (p: PessoaApoio | null) => {
    setEditando(p);
    setForm(
      p
        ? {
            nome: p.nome,
            telefone: p.telefone ?? "",
            tipo: p.tipo,
            cargo_id: p.cargo_id ?? "",
            unidade_id: p.unidade_id ?? "",
            cpf: p.cpf ?? "",
            genero: p.genero ?? "",
            data_nascimento: p.data_nascimento ?? "",
            observacao: p.observacao ?? "",
            ativo: p.ativo,
          }
        : vazio,
    );
    setDialogOpen(true);
  };

  const gravar = async () => {
    const candidato = {
      nome: form.nome,
      telefone: form.telefone || null,
      tipo: form.tipo,
      cargo_id: form.cargo_id || null,
      unidade_id: form.unidade_id || null,
      cpf: form.cpf || null,
      genero: form.genero || null,
      data_nascimento: form.data_nascimento || null,
      observacao: form.observacao || null,
      colaborador_id: null,
    };
    const parsed = validateWithToast(pessoaApoioSchema, candidato, (msg) =>
      toast.error("Verifique os dados", { description: msg }),
    );
    if (!parsed) return;
    try {
      await salvar.mutateAsync({ ...candidato, ativo: form.ativo, id: editando?.id });
      toast.success(editando ? "Cadastro atualizado" : "Pessoa cadastrada");
      setDialogOpen(false);
    } catch (e) {
      toast.error("Não foi possível salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const remover = async () => {
    if (!aExcluir) return;
    try {
      await excluir.mutateAsync(aExcluir.id);
      toast.success("Cadastro removido");
    } catch (e) {
      toast.error("Não foi possível remover", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    setAExcluir(null);
  };

  return (
    <DpPage>
      <Helmet><title>Folguistas e testes — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={UserPlus}
        title="Folguistas e testes"
        description="Pessoas que ajudam de forma eventual, sem cadastro completo de colaborador."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-10 rounded-full sm:size-lg" asChild>
              <Link to="/dp/colaboradores">
                <Users className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Colaboradores</span>
              </Link>
            </Button>
            <Button size="sm" className="h-10 rounded-full font-semibold sm:size-lg" onClick={() => abrir(null)}>
              <Plus className="h-4 w-4 mr-1.5 sm:h-5 sm:w-5 sm:mr-2" /> Nova
              <span className="hidden sm:inline">&nbsp;Pessoa</span>
            </Button>
          </>
        }
      />

      <DpFilters search={{ value: search, onChange: setSearch, placeholder: "Nome ou telefone..." }} />

      <DpContentCard>
        {lista.isLoading ? (
          <TableSkeleton columns={5} headers={["Pessoa", "Telefone", "Tipo", "Cargo / Unidade", ""]} />
        ) : visiveis.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhuma pessoa cadastrada aqui ainda. Quem você adiciona na rotina do dia como folguista
            ou em teste passa a aparecer nesta lista.
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cargo / Unidade</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((p) => (
                  <TableRow key={p.id} className={p.ativo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      {p.nome}
                      {!p.ativo && <Badge variant="outline" className="ml-2">Inativa</Badge>}
                    </TableCell>
                    <TableCell>{p.telefone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{TIPO_LABEL[p.tipo]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {nomeCargo(p.cargo_id)} · {nomeUnidade(p.unidade_id)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => abrir(p)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setAExcluir(p)} aria-label="Remover">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DpContentCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar pessoa" : "Nova pessoa de apoio"}</DialogTitle>
            <DialogDescription>
              Guarde o contato para chamar de novo. Não gera folha, ponto nem acesso ao portal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-2 pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Nome *</Label>
                <Input
                  value={form.nome}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  maxLength={20}
                  inputMode="tel"
                  placeholder="(62) 90000-0000"
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v as PessoaApoioTipo })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="folguista">Folguista</SelectItem>
                    <SelectItem value="teste">Em teste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Nascimento</Label>
                <Input
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Cargo habitual</Label>
                <Select
                  value={form.cargo_id || "nenhum"}
                  onValueChange={(v) => setForm({ ...form, cargo_id: v === "nenhum" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não definido</SelectItem>
                    {(cargos.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Unidade habitual</Label>
                <Select
                  value={form.unidade_id || "nenhum"}
                  onValueChange={(v) => setForm({ ...form, unidade_id: v === "nenhum" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Não definida" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não definida</SelectItem>
                    {(unidades.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>CPF</Label>
                <Input
                  value={form.cpf}
                  maxLength={14}
                  inputMode="numeric"
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Gênero</Label>
                <Select
                  value={form.genero || "nenhum"}
                  onValueChange={(v) => setForm({ ...form, genero: v === "nenhum" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Não informar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Não informar</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Observação</Label>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Como se saiu, disponibilidade, preferências..."
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="pr-3">
                <Label className="text-sm">Disponível para chamar</Label>
                <p className="text-xs text-muted-foreground">
                  Desligue para tirar da lista de sugestões da rotina do dia.
                </p>
              </div>
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={salvar.isPending}>
              Cancelar
            </Button>
            <Button onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aExcluir} onOpenChange={(v) => !v && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {aExcluir?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O contato sai da lista. Os dias já registrados na rotina continuam como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remover}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
