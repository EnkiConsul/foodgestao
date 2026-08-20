import { useState } from "react";
import { Calculator, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpVaCalculadora } from "@/hooks/useDpVaCalculadora";
import { MOTIVO_DESCONTO_LABEL, type MotivoDesconto } from "@/lib/dp/va-calculo";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataCurta = (isoData: string) => {
  const [, m, d] = isoData.split("-");
  return `${d}/${m}`;
};

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const baixarCsv = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Calculadora de vale-alimentação: mostra, por colaborador, os dias previstos
 * do próximo período menos os dias pagos e não trabalhados no anterior.
 */
export function VaCalculadora() {
  const [competencia, setCompetencia] = useState(mesAtual());
  const [unidade, setUnidade] = useState("todas");
  const { data: unidades = [] } = useDpUnidades();
  const va = useDpVaCalculadora(competencia, unidade);

  const exportar = () => {
    const cab = [
      "Colaborador", "Unidade", "Valor do dia", "Dias previstos", "Dias descontados",
      "Falta", "Folga extra", "Atestado", "Ferias", "Dias a pagar", "Desconto", "A depositar",
    ].join(";");
    const linhas = va.linhas.map((l) =>
      [
        l.nome, l.unidade_nome ?? "", l.valorDia.toFixed(2).replace(".", ","),
        l.diasPrevistos, l.descontos.dias,
        l.descontos.porMotivo.falta, l.descontos.porMotivo.folga_extra,
        l.descontos.porMotivo.atestado, l.descontos.porMotivo.ferias,
        l.deposito.diasPagos,
        l.deposito.desconto.toFixed(2).replace(".", ","),
        l.deposito.depositar.toFixed(2).replace(".", ","),
      ].join(";"),
    );
    baixarCsv(`vale-alimentacao-${competencia}.csv`, [cab, ...linhas].join("\n"));
  };

  return (
    <div className="space-y-3">
      <DpContentCard contentClassName="p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Mês do pagamento</Label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value || mesAtual())} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todas">Todas</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={exportar} disabled={va.linhas.length === 0}>
              <Download className="mr-2 size-4" /> Exportar CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Pagamento em <strong className="text-foreground">{dataCurta(va.periodo.pagamento)}</strong>, com corte em{" "}
            <strong className="text-foreground">{dataCurta(va.periodo.corte)}</strong>. O depósito cobre{" "}
            {dataCurta(va.periodo.cobertura.inicio)} a {dataCurta(va.periodo.cobertura.fim)} e desconta os dias
            pagos e não trabalhados entre {dataCurta(va.periodo.conferencia.inicio)} e{" "}
            {dataCurta(va.periodo.conferencia.fim)}. Cada colaborador pode ter dia de pagamento e regras próprios.
          </span>
        </div>
      </DpContentCard>

      {va.isError && <DpErrorState onRetry={va.refetchAll} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total a depositar", value: brl(va.total) },
          { label: "Dias pagos", value: String(va.totalDias) },
          { label: "Dias descontados", value: String(va.totalDescontados) },
          { label: "Colaboradores", value: String(va.linhas.length) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <Calculator className="size-5 text-primary" />
            <p className="mt-2 text-xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <DpContentCard>
        {va.isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Calculando…</p>
        ) : va.linhas.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum colaborador com vale-alimentação ativo nesta seleção.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {va.linhas.map((l) => (
              <div key={l.colaborador_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {l.nome}
                    {l.unidade_nome ? <span className="text-muted-foreground"> · {l.unidade_nome}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.diasPrevistos} dias previstos ({l.origemPrevistos === "escala" ? "escala publicada" : "jornada habitual"})
                    {l.folgasDescontadas > 0 && ` · −${l.folgasDescontadas} folga(s) já marcada(s)`}
                    {l.descontos.dias > 0 && ` · −${l.descontos.dias} do período anterior`}
                    {" · "}{brl(l.valorDia)}/dia
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(Object.keys(l.descontos.porMotivo) as MotivoDesconto[])
                      .filter((m) => l.descontos.porMotivo[m] > 0)
                      .map((m) => (
                        <Badge key={m} variant="secondary" className="text-[11px]">
                          {MOTIVO_DESCONTO_LABEL[m]}: {l.descontos.porMotivo[m]}
                        </Badge>
                      ))}
                    {l.folgasPendentes > 0 && (
                      <Badge variant="outline" className="text-[11px]">
                        {l.folgasPendentes} folga(s) pendente(s) de aprovação
                      </Badge>
                    )}
                    {l.semValorDia && (
                      <Badge variant="destructive" className="text-[11px]">Sem valor por dia cadastrado</Badge>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{brl(l.deposito.depositar)}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.deposito.diasPagos} dias
                    {l.deposito.desconto > 0 && ` · desconto ${brl(l.deposito.desconto)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DpContentCard>
    </div>
  );
}
