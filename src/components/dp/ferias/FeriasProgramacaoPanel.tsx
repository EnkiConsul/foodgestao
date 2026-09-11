import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DpContentCard, DpFilterCard } from "@/components/dp/DpPage";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpFeriasProgramacao } from "@/hooks/useDpFeriasProgramacao";
import {
  baixarProgramacaoCsv,
  imprimirProgramacao,
  SITUACAO_PROGRAMACAO_LABEL,
} from "@/lib/dp/ferias-programacao";
import { NIVEL_VENCIMENTO_META } from "@/lib/dp/ferias-direito";

const fmt = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM/yyyy") : "..../..../......");
const num = (v: number | null) => (v === null ? "...." : v);

/** Relatório sintético de férias no formato da contabilidade, com impressão e CSV. */
export function FeriasProgramacaoPanel() {
  const [unidadeId, setUnidadeId] = useState<string>("todas");
  const [incluirDesligados, setIncluirDesligados] = useState(false);
  const { data: unidades = [] } = useDpUnidades();
  const { relatorio, isLoading } = useDpFeriasProgramacao({
    unidadeId: unidadeId === "todas" ? null : unidadeId,
    incluirDesligados,
  });

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
                {(unidades as any[]).map((u) => (
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
          <div className="flex gap-2 pb-0.5">
            <Button
              variant="outline"
              disabled={!relatorio || relatorio.linhas.length === 0}
              onClick={() => relatorio && imprimirProgramacao(relatorio)}
            >
              <Printer className="mr-1 size-4" /> Imprimir / PDF
            </Button>
            <Button
              variant="outline"
              disabled={!relatorio || relatorio.linhas.length === 0}
              onClick={() => relatorio && baixarProgramacaoCsv(relatorio)}
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
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : !relatorio || relatorio.linhas.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum período aquisitivo para os filtros escolhidos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2">Cód.</th>
                  <th className="px-2 py-2">Empregado</th>
                  <th className="px-2 py-2">Admissão</th>
                  <th className="px-2 py-2">Vencto.</th>
                  <th className="px-2 py-2 text-center">Venc.</th>
                  <th className="px-2 py-2 text-center">Prop.</th>
                  <th className="px-2 py-2">Início aquis.</th>
                  <th className="px-2 py-2">Fim aquis.</th>
                  <th className="px-2 py-2">Início gozo</th>
                  <th className="px-2 py-2 text-center">Dias</th>
                  <th className="px-2 py-2 text-center">Abono</th>
                  <th className="px-2 py-2 text-center">13º</th>
                  <th className="px-2 py-2 text-center">Dir.</th>
                  <th className="px-2 py-2 text-center">Goz.</th>
                  <th className="px-2 py-2 text-center">Rest.</th>
                  <th className="px-2 py-2">Limite p/ gozo</th>
                  <th className="px-2 py-2 text-center">Afast.</th>
                  <th className="px-2 py-2 text-center">Faltas</th>
                  <th className="px-2 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {relatorio.linhas.map((l, i) => {
                  const meta = NIVEL_VENCIMENTO_META[l.situacao];
                  return (
                    <tr key={`${l.colaboradorId}-${l.inicioAquisitivo}-${i}`}>
                      <td className="px-2 py-1.5 text-right">{l.codigo ?? ""}</td>
                      <td className="max-w-56 truncate px-2 py-1.5 font-medium">{l.nome ?? ""}</td>
                      <td className="px-2 py-1.5">{l.admissao ? fmt(l.admissao) : ""}</td>
                      <td className="px-2 py-1.5">{fmt(l.fimAquisitivo)}</td>
                      <td className="px-2 py-1.5 text-center">{l.feriasVencidas ?? ""}</td>
                      <td className="px-2 py-1.5 text-center">{l.feriasProporcionais ?? ""}</td>
                      <td className="px-2 py-1.5">{fmt(l.inicioAquisitivo)}</td>
                      <td className="px-2 py-1.5">{fmt(l.fimAquisitivo)}</td>
                      <td className="px-2 py-1.5">{fmt(l.gozoInicio)}</td>
                      <td className="px-2 py-1.5 text-center">{num(l.gozoDias)}</td>
                      <td className="px-2 py-1.5 text-center">{num(l.gozoAbono)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {l.gozoAdianta13 === null ? "...." : l.gozoAdianta13 ? "SIM" : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-center">{l.diasDireito}</td>
                      <td className="px-2 py-1.5 text-center">{l.diasGozados}</td>
                      <td className="px-2 py-1.5 text-center">{l.diasRestantes}</td>
                      <td className="px-2 py-1.5">{fmt(l.limiteGozo)}</td>
                      <td className="px-2 py-1.5 text-center">{l.diasAfastamento ?? "-"}</td>
                      <td className="px-2 py-1.5 text-center">{l.diasFaltas ?? "-"}</td>
                      <td className="px-2 py-1.5">
                        <Badge className={meta.tone}>{SITUACAO_PROGRAMACAO_LABEL[l.situacao]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DpContentCard>
    </>
  );
}
