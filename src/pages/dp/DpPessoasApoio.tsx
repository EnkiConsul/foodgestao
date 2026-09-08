import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpFilters } from "@/components/dp/DpFilters";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { useDpCargos, useDpUnidades } from "@/hooks/useDpCadastros";
import {
  useDpPessoasApoio, useExcluirDpPessoaApoio,
  type PessoaApoio, type PessoaApoioTipo,
} from "@/hooks/useDpPessoasApoio";
import { useDpSetores } from "@/hooks/useDpSetores";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { PessoaApoioFormDialog } from "@/components/dp/PessoaApoioFormDialog";

const TIPO_LABEL: Record<PessoaApoioTipo, string> = {
  folguista: "Folguista",
  teste: "Em teste",
};

/**
 * Banco de folguistas e pessoas em teste: quem já trabalhou eventualmente na
 * operação e pode ser chamado de novo, sem cadastro completo de colaborador.
 */
export default function DpPessoasApoio() {
  const lista = useDpPessoasApoio();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const excluir = useExcluirDpPessoaApoio();
  const { todos: todosSetores } = useDpSetores();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<PessoaApoio | null>(null);
  const [aExcluir, setAExcluir] = useState<PessoaApoio | null>(null);
  const [transformando, setTransformando] = useState<PessoaApoio | null>(null);

  const nomeCargo = (id: string | null) => (cargos.data ?? []).find((c) => c.id === id)?.nome ?? "—";
  const nomeUnidade = (id: string | null) => (unidades.data ?? []).find((u) => u.id === id)?.nome ?? "—";
  const nomeSetor = (id: string | null) => (id ? todosSetores.find((s) => s.id === id)?.nome ?? null : null);

  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lista.data ?? []).filter(
      (p) => !q || p.nome.toLowerCase().includes(q) || (p.telefone ?? "").includes(q),
    );
  }, [lista.data, search]);

  const abrir = (p: PessoaApoio | null) => {
    setEditando(p);
    setDialogOpen(true);
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
                      {nomeSetor(p.setor_id) ? ` · ${nomeSetor(p.setor_id)}` : ""}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTransformando(p)}
                        aria-label="Promover a Colaborador"
                        title="Promover a Colaborador"
                        disabled={!!p.colaborador_id}
                      >
                        <UserPlus className="h-4 w-4 text-primary" />
                      </Button>
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

      <PessoaApoioFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pessoa={editando}
      />


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

      <ColaboradorFormDialog
        open={!!transformando}
        onOpenChange={(o) => !o && setTransformando(null)}
        pessoaApoioInicial={transformando}
      />
    </DpPage>
  );
}
