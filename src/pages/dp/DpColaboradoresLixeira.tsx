import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { MotivoDialog } from "@/components/dp/MotivoDialog";
import {
  useDpColaboradoresLixeira, useRestaurarDpColaborador, usePurgarDpColaborador,
  type DpColaboradorLixeira,
} from "@/hooks/useDpColaboradores";

const fmtDateTime = (d: string) => new Date(d).toLocaleString("pt-BR");

/** Dias restantes até a purga automática (retenção de 7 dias). */
function diasRestantes(expiraEm: string) {
  const diff = new Date(expiraEm).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export default function DpColaboradoresLixeira() {
  const lixeira = useDpColaboradoresLixeira();
  const restaurar = useRestaurarDpColaborador();
  const purgar = usePurgarDpColaborador();
  const [search, setSearch] = useState("");
  const [toRestore, setToRestore] = useState<DpColaboradorLixeira | null>(null);
  const [toPurge, setToPurge] = useState<DpColaboradorLixeira | null>(null);

  const items = lixeira.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.nome.toLowerCase().includes(q) || (i.matricula ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <DpPage>
      <Helmet>
        <title>Lixeira de colaboradores — Pessoas 360°</title>
        <meta name="description" content="Restaure cadastros de colaboradores excluídos por engano em até 7 dias." />
      </Helmet>

      <DpPageHeader
        icon={Trash2}
        title="Lixeira de colaboradores"
        description="Cadastros excluídos ficam aqui por 7 dias e podem ser restaurados. Depois desse prazo são apagados definitivamente."
        actions={
          <Button variant="outline" className="rounded-full" asChild>
            <Link to="/dp/colaboradores">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Link>
          </Button>
        }
      />

      <DpContentCard>
        <div className="mb-4 max-w-sm">
          <Input
            placeholder="Buscar por nome ou matrícula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {lixeira.isLoading ? (
          <TableSkeleton columns={6} />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum cadastro na lixeira.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Cargo / Unidade</TableHead>
                <TableHead>Excluído em</TableHead>
                <TableHead>Justificativa</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {c.nome}
                    {c.matricula && (
                      <span className="ml-2 text-xs text-muted-foreground">#{c.matricula}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[c.cargo_nome, c.unidade_nome].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {fmtDateTime(c.deleted_at)}
                  </TableCell>
                  <TableCell className="max-w-[240px] text-sm text-muted-foreground">
                    {c.delete_reason || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={diasRestantes(c.expira_em) <= 2 ? "destructive" : "secondary"}>
                      {diasRestantes(c.expira_em)} dia(s)
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setToRestore(c)}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Restaurar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setToPurge(c)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Apagar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DpContentCard>

      <AlertDialog open={!!toRestore} onOpenChange={(o) => !o && setToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{toRestore?.nome}</strong> volta para a lista de colaboradores com os mesmos dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!toRestore) return;
                try {
                  await restaurar.mutateAsync(toRestore.id);
                  toast.success("Cadastro restaurado");
                } catch (e) {
                  toast.error("Erro ao restaurar", {
                    description: e instanceof Error ? e.message : String(e),
                  });
                }
                setToRestore(null);
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MotivoDialog
        open={!!toPurge}
        onOpenChange={(o) => !o && setToPurge(null)}
        title="Apagar definitivamente?"
        description={`O cadastro de ${toPurge?.nome ?? "colaborador"} e seus vínculos serão apagados sem possibilidade de restauração.`}
        label="Justificativa da exclusão definitiva"
        confirmLabel="Apagar definitivamente"
        loading={purgar.isPending}
        onConfirm={async (motivo) => {
          if (!toPurge) return;
          try {
            await purgar.mutateAsync({ id: toPurge.id, motivo });
            toast.success("Cadastro apagado definitivamente");
          } catch (e) {
            toast.error("Erro ao apagar", {
              description: e instanceof Error ? e.message : String(e),
            });
          }
          setToPurge(null);
        }}
      />
    </DpPage>
  );
}
