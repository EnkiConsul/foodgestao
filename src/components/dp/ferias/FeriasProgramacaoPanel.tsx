import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { DpContentCard, DpFilterCard } from "@/components/dp/DpPage";
import { DpTableColumnHeader } from "@/components/dp/DpTableColumnHeader";
import { DpTableColumnsMenu } from "@/components/dp/DpTableColumnsMenu";
import { useDpTableColumns } from "@/hooks/useDpTableColumns";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpFeriasProgramacao } from "@/hooks/useDpFeriasProgramacao";
import {
  baixarProgramacaoCsv,
  imprimirProgramacao,
  programacaoEscopoTexto,
  PROGRAMACAO_COLUNAS,
  PROGRAMACAO_COL_ORDER,
  PROGRAMACAO_COL_WIDTHS,
  SITUACAO_PROGRAMACAO_LABEL,
  type ProgramacaoColKey,
  type ProgramacaoLinha,
} from "@/lib/dp/ferias-programacao";
import { NIVEL_VENCIMENTO_META } from "@/lib/dp/ferias-direito";

const fmt = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM/yyyy") : "—");

const COL_POR_KEY = new Map(PROGRAMACAO_COLUNAS.map((c) => [c.key, c]));

/** Relatório sintético de férias no formato da contabilidade, com impressão e CSV. */
export function FeriasProgramacaoPanel() {
  const [unidadeId, setUnidadeId] = useState<string>("todas");
  const [incluirDesligados, setIncluirDesligados] = useState(false);
  const { selectedCompanyId } = useCompanyContext();
  const { data: unidadesTodas = [] } = useDpUnidades();
  const unidades = (unidadesTodas as any[]).filter((u) => u.company_id === selectedCompanyId);
  const { relatorio, isLoading } = useDpFeriasProgramacao({
    unidadeId: unidadeId === "todas" ? null : unidadeId,
    incluirDesligados,
  });

  const cols = useDpTableColumns<ProgramacaoColKey, ProgramacaoColKey>({
    storageKey: "dp_ferias_prog_col",
    screenKey: "dp_ferias_programacao",
    defaultOrder: PROGRAMACAO_COL_ORDER,
    defaultWidths: PROGRAMACAO_COL_WIDTHS,
    hiddenByDefault: ["diasParaMarcar"],
    essentialKeys: ["nome"],
    defaultSortKey: "nome",
  });

  const linhas = useMemo<ProgramacaoLinha[]>(() => {
    const base = relatorio?.linhas ?? [];
    // Filtros por valor exibido, coluna a coluna.
    const filtradas = base.filter((l) =>
      cols.visibleOrder.every((k) => {
        const ativos = cols.colFilters[k] ?? [];
        if (!ativos.length) return true;
        return ativos.includes(COL_POR_KEY.get(k)!.valor(l));
      }),
    );
    const meta = COL_POR_KEY.get(cols.sortKey);
    if (!meta) return filtradas;
    const dir = cols.sortDir === "asc" ? 1 : -1;
    return filtradas.slice().sort((a, b) => {
      const va = meta.valor(a);
      const vb = meta.valor(b);
      const na = Number(va.replace(",", "."));
      const nb = Number(vb.replace(",", "."));
      const cmp =
        va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb)
          ? na - nb
          : va.localeCompare(vb, "pt-BR");
      return cmp * dir;
    });
  }, [relatorio, cols.visibleOrder, cols.colFilters, cols.sortKey, cols.sortDir]);

  const escopo = relatorio ? programacaoEscopoTexto(relatorio) : null;
  const semLinhas = linhas.length === 0;

  return (
    <>
      <DpFilterCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todas">Todas</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[hsl(var(--primary))]"
              checked={incluirDesligados}
              onChange={(e) => setIncluirDesligados(e.target.checked)}
            />
            Incluir desligados
          </label>
          <div className="flex flex-wrap gap-2 pb-0.5">
            <DpTableColumnsMenu
              columns={cols.colOrder.map((k) => ({ key: k, label: COL_POR_KEY.get(k)!.label }))}
              hidden={cols.hidden}
              essentialKeys={["nome"]}
              onToggle={cols.toggleHidden}
              onReset={cols.resetLayout}
            />
            <Button
              variant="outline"
              disabled={!relatorio || semLinhas}
              onClick={() => relatorio && imprimirProgramacao(relatorio, cols.visibleOrder)}
            >
              <Printer className="mr-1 size-4" /> Imprimir / PDF
            </Button>
            <Button
              variant="outline"
              disabled={!relatorio || semLinhas}
              onClick={() => relatorio && baixarProgramacaoCsv(relatorio, cols.visibleOrder)}
            >
              <Download className="mr-1 size-4" /> CSV
            </Button>
          </div>
        </div>
      </DpFilterCard>

      <DpContentCard className="p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{relatorio?.razaoSocial ?? "Empresa"}</p>
          <p className="text-xs text-muted-foreground">
            CNPJ: {relatorio?.cnpj ?? "-"} · Data base: {relatorio ? fmt(relatorio.dataBase) : "—"}
            {relatorio ? ` · Total de empregados: ${relatorio.totalEmpregados}` : ""}
          </p>
          {escopo && <p className="text-xs text-muted-foreground">{escopo}</p>}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : !relatorio || semLinhas ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum período aquisitivo para os filtros escolhidos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-xs" style={{ minWidth: cols.larguraTotal }}>
              <TableHeader>
                <TableRow>
                  {cols.visibleOrder.map((k) => {
                    const meta = COL_POR_KEY.get(k)!;
                    return (
                      <DpTableColumnHeader
                        key={k}
                        label={meta.curto}
                        width={cols.colWidths[k]}
                        center={meta.center}
                        sortAtivo={cols.sortKey === k}
                        sortDir={cols.sortDir}
                        onSort={(dir) => cols.aplicarSort(k, dir)}
                        ativos={cols.colFilters[k] ?? []}
                        getOpcoes={() =>
                          Array.from(new Set((relatorio.linhas ?? []).map((l) => meta.valor(l))))
                            .filter((v) => v !== "")
                            .sort((a, b) => a.localeCompare(b, "pt-BR"))
                        }
                        onToggle={(v) => cols.toggleColValue(k, v)}
                        onSelecionarTodos={() =>
                          cols.setColFilters((prev) => ({
                            ...prev,
                            [k]: Array.from(new Set(relatorio.linhas.map((l) => meta.valor(l)))).filter((v) => v !== ""),
                          }))
                        }
                        onLimpar={() => cols.setColFilters((prev) => ({ ...prev, [k]: [] }))}
                        arrastando={cols.dragCol === k}
                        onDragStart={() => cols.setDragCol(k)}
                        onDrop={() => cols.soltarSobre(k)}
                        onDragEnd={() => cols.setDragCol(null)}
                        onResize={(largura) => cols.resize(k, largura)}
                        onResetWidth={() => cols.resetWidth(k)}
                      />
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l, i) => (
                  <TableRow key={`${l.colaboradorId}-${l.inicioAquisitivo}-${i}`}>
                    {cols.visibleOrder.map((k) => {
                      const meta = COL_POR_KEY.get(k)!;
                      const align = meta.center ? "text-center" : meta.right ? "text-right" : "";
                      return (
                        <TableCell
                          key={k}
                          className={`whitespace-nowrap px-2 py-1.5 ${align} ${k === "nome" ? "font-medium" : ""}`}
                        >
                          {k === "situacao" ? (
                            <Badge className={NIVEL_VENCIMENTO_META[l.situacao].tone}>
                              {SITUACAO_PROGRAMACAO_LABEL[l.situacao]}
                            </Badge>
                          ) : (
                            meta.valor(l)
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DpContentCard>
    </>
  );
}
