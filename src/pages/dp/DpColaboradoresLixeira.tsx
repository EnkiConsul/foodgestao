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
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { DpTableColumnsMenu } from "@/components/dp/DpTableColumnsMenu";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
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

type LixColKey = "colaborador" | "cargoUnidade" | "excluidoEm" | "justificativa" | "prazo";
type LixSortKey = "padrao" | "colaborador" | "cargoUnidade" | "excluidoEm" | "prazo";

const LIX_COL_ORDER: LixColKey[] = ["colaborador", "cargoUnidade", "excluidoEm", "justificativa", "prazo"];
const LIX_COL_WIDTHS: Record<LixColKey, number> = {
  colaborador: 220, cargoUnidade: 200, excluidoEm: 160, justificativa: 240, prazo: 110,
};
const LIX_ACOES_WIDTH = 200;

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

  /** Configuração das colunas da tabela (formato planilha). */
  const COLS = useMemo(() => ({
    colaborador: {
      label: "Colaborador", sortKey: "colaborador" as const,
      value: (c: DpColaboradorLixeira) => c.nome,
      render: (c: DpColaboradorLixeira) => (
        <span className="block truncate font-medium" title={c.nome}>
          {c.nome}
          {c.matricula && <span className="ml-2 text-xs text-muted-foreground">#{c.matricula}</span>}
        </span>
      ),
    },
    cargoUnidade: {
      label: "Cargo / Unidade", sortKey: "cargoUnidade" as const,
      value: (c: DpColaboradorLixeira) => [c.cargo_nome, c.unidade_nome].filter(Boolean).join(" · ") || "—",
      render: (c: DpColaboradorLixeira) => {
        const txt = [c.cargo_nome, c.unidade_nome].filter(Boolean).join(" · ") || "—";
        return <span className="block truncate text-sm text-muted-foreground" title={txt}>{txt}</span>;
      },
    },
    excluidoEm: {
      label: "Excluído em", sortKey: "excluidoEm" as const,
      value: (c: DpColaboradorLixeira) => fmtDateTime(c.deleted_at),
      render: (c: DpColaboradorLixeira) => <span className="whitespace-nowrap text-sm">{fmtDateTime(c.deleted_at)}</span>,
    },
    justificativa: {
      label: "Justificativa", sortKey: "padrao" as const,
      value: (c: DpColaboradorLixeira) => c.delete_reason || "—",
      render: (c: DpColaboradorLixeira) => (
        <span className="block truncate text-sm text-muted-foreground" title={c.delete_reason ?? ""}>
          {c.delete_reason || "—"}
        </span>
      ),
    },
    prazo: {
      label: "Prazo", sortKey: "prazo" as const,
      value: (c: DpColaboradorLixeira) => `${diasRestantes(c.expira_em)} dia(s)`,
      render: (c: DpColaboradorLixeira) => (
        <Badge variant={diasRestantes(c.expira_em) <= 2 ? "destructive" : "secondary"}>
          {diasRestantes(c.expira_em)} dia(s)
        </Badge>
      ),
    },
  }), []);

  const {
    colWidths, resize, resetWidth,
    hidden, toggleHidden, resetLayout, visibleOrder,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
  } = useDpTableColumns<LixColKey, LixSortKey>({
    storageKey: "dp_lixeira_col",
    screenKey: "dp_colaboradores_lixeira",
    defaultOrder: LIX_COL_ORDER,
    defaultWidths: LIX_COL_WIDTHS,
    essentialKeys: ["colaborador"],
    acoesWidth: LIX_ACOES_WIDTH,
    defaultSortKey: "padrao",
  });

  /** Aplica os filtros por valor de cada coluna. */
  const filtradoPorColuna = useMemo(() => (
    filtered.filter((c) => LIX_COL_ORDER.every((k) => {
      const sel = colFilters[k] ?? [];
      return !sel.length || sel.includes(COLS[k].value(c));
    }))
  ), [filtered, colFilters, COLS]);

  /** Opções de filtro de uma coluna considerando os filtros das demais. */
  const opcoesColuna = (k: LixColKey) => {
    const outros = filtered.filter((c) => LIX_COL_ORDER.every((other) => {
      if (other === k) return true;
      const sel = colFilters[other] ?? [];
      return !sel.length || sel.includes(COLS[other].value(c));
    }));
    const set = new Set<string>();
    outros.forEach((c) => set.add(COLS[k].value(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  };

  const linhas = useMemo(() => {
    if (sortKey === "padrao") return filtradoPorColuna;
    const arr = [...filtradoPorColuna];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === "excluidoEm") cmp = (a.deleted_at ?? "").localeCompare(b.deleted_at ?? "");
      else if (sortKey === "prazo") cmp = diasRestantes(a.expira_em) - diasRestantes(b.expira_em);
      else {
        const col = LIX_COL_ORDER.find((k) => COLS[k].sortKey === sortKey);
        if (!col) return 0;
        cmp = COLS[col].value(a).localeCompare(COLS[col].value(b), "pt-BR", { sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtradoPorColuna, sortKey, sortDir, COLS]);

  return (
    <DpPage>
      <Helmet>
        <title>Lixeira de colaboradores — Pessoas 360°</title>
        <meta name="description" content="Restaure cadastros de colaboradores excluídos por engano em até 7 dias." />
      </Helmet>

      <DpPageHeader
        icon={Trash2}
        title="Lixeira de Colaboradores"
        description="Cadastros excluídos ficam aqui por 7 dias e podem ser restaurados. Depois desse prazo são apagados definitivamente."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DpTableColumnsMenu
              columns={LIX_COL_ORDER.map((k) => ({ key: k, label: COLS[k].label }))}
              hidden={hidden}
              essentialKeys={["colaborador"]}
              onToggle={toggleHidden}
              onReset={resetLayout}
            />
            <Button variant="outline" className="rounded-full" asChild>
              <Link to="/dp/colaboradores">
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Link>
            </Button>
          </div>
        }
      />

      <DpContentCard contentClassName="p-4 md:p-5">
        <div className="mb-4 md:max-w-sm">
          <Input
            placeholder="Buscar por nome ou matrícula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {lixeira.isLoading ? (
          <div className="hidden md:block"><TableSkeleton columns={6} /></div>
        ) : linhas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {filtered.length === 0
              ? "Nenhum cadastro na lixeira."
              : "Nenhum resultado para os filtros de coluna aplicados."}
          </p>
        ) : (
          <>
          {/* Mobile: lista de cartões */}
          <ul className="space-y-3 md:hidden">
            {linhas.map((c) => (
              <li key={c.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.cargo_nome, c.unidade_nome].filter(Boolean).join(" · ") || "—"}
                      {c.matricula ? ` · #${c.matricula}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={diasRestantes(c.expira_em) <= 2 ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {diasRestantes(c.expira_em)} d
                  </Badge>
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Excluído em</dt>
                    <dd className="text-right font-medium">{fmtDateTime(c.deleted_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">Justificativa</dt>
                    <dd className="text-right">{c.delete_reason || "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2 border-t border-border/60 pt-2">
                  <Button variant="outline" size="sm" className="min-h-10 flex-1" onClick={() => setToRestore(c)}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Restaurar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-10 flex-1 text-destructive hover:text-destructive"
                    onClick={() => setToPurge(c)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Apagar
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden w-full overflow-x-auto md:block">
            <Table className="table-fixed text-xs" style={{ width: "100%", minWidth: larguraTotal + LIX_ACOES_WIDTH }}>
              <TableHeader>
                <TableRow>
                  {visibleOrder.map((k) => (
                    <DpTableColumnHeader
                      key={k}
                      label={COLS[k].label}
                      width={colWidths[k]}
                      sortAtivo={sortKey === COLS[k].sortKey && COLS[k].sortKey !== "padrao"}
                      sortDir={sortDir}
                      onSort={(dir) => aplicarSort(COLS[k].sortKey, dir)}
                      ativos={colFilters[k] ?? []}
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
                    className="relative select-none text-right text-xs"
                    style={{ width: LIX_ACOES_WIDTH, minWidth: LIX_ACOES_WIDTH, maxWidth: LIX_ACOES_WIDTH }}
                  >
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((c) => (
                  <TableRow key={c.id} className="align-middle">
                    {visibleOrder.map((k) => (
                      <TableCell key={k} className="overflow-hidden px-3" style={{ width: colWidths[k], maxWidth: colWidths[k] }}>
                        {COLS[k].render(c)}
                      </TableCell>
                    ))}
                    <TableCell
                      className="whitespace-nowrap px-3 text-right"
                      style={{ width: LIX_ACOES_WIDTH, maxWidth: LIX_ACOES_WIDTH }}
                    >
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
          </div>
          </>
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
