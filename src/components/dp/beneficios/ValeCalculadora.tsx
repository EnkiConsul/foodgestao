import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, CheckCircle2, Download, Info } from "lucide-react";
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
import { useDpValeCalculadora, VALE_LABEL, type LinhaVale, type ValeTipo } from "@/hooks/useDpValeCalculadora";
import { useDpValeApuracoes, type FecharLinha } from "@/hooks/useDpValeApuracoes";
import { ValeMemoriaDialog } from "@/components/dp/beneficios/ValeMemoriaDialog";
import { calcularVaDeposito, diferencaCicloAnterior } from "@/lib/dp/va-calculo";

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

const soDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 3);

interface Props {
  /** `va` = vale-alimentação, `vt` = vale-transporte. */
  tipo: ValeTipo;
}

interface LinhaCalculo {
  base: LinhaVale;
  pagos: string;
  trabalhados: string;
  pagosDoFechamento: boolean;
  diferenca: number;
  totalDias: number;
  depositar: number;
  desconto: number;
  fechada: boolean;
}

/**
 * Cálculo mensal dos vales pagos por dia. Os dias do ciclo atual vêm da escala,
 * jornada ou convocações; os dias do ciclo anterior são informados pelo gestor
 * (o ponto ainda não está implantado) e a diferença entra no total a depositar.
 */
export function ValeCalculadora({ tipo }: Props) {
  const [competencia, setCompetencia] = useState(mesAtual());
  const [unidade, setUnidade] = useState("todas");
  const [memoria, setMemoria] = useState<LinhaVale | null>(null);
  const { data: unidades = [] } = useDpUnidades();
  const vale = useDpValeCalculadora(tipo, competencia, unidade);
  const apuracoes = useDpValeApuracoes(tipo, competencia);
  const label = VALE_LABEL[tipo];

  /** Rascunho local dos dias informados, sincronizado com o que está salvo. */
  const [edits, setEdits] = useState<Record<string, { pagos?: string; trabalhados?: string }>>({});
  useEffect(() => {
    setEdits({});
  }, [competencia, tipo, unidade]);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const linhas = useMemo<LinhaCalculo[]>(() => {
    return vale.linhas.map((base) => {
      const salvo = apuracoes.atual.get(base.colaborador_id);
      const anterior = apuracoes.anteriores.get(base.colaborador_id);
      const draft = edits[base.colaborador_id] ?? {};

      const pagosSalvos =
        salvo?.dias_pagos_anterior != null && salvo.dias_pagos_anterior > 0
          ? salvo.dias_pagos_anterior
          : (anterior?.total_dias ?? null);
      const pagos = draft.pagos ?? (pagosSalvos == null ? "" : String(pagosSalvos));
      const trabalhados =
        draft.trabalhados ??
        (salvo?.dias_trabalhados_anterior == null ? "" : String(salvo.dias_trabalhados_anterior));

      const pagosNum = pagos === "" ? 0 : Number(pagos);
      const trabalhadosNum = trabalhados === "" ? null : Number(trabalhados);
      const diferenca = diferencaCicloAnterior(pagosNum, trabalhadosNum);
      const deposito = calcularVaDeposito({
        diasPrevistos: base.diasPrevistos,
        diasDescontados: 0,
        diferencaAnterior: diferenca,
        valorDia: base.valorDia,
        descontoColaborador: base.descontoColaborador,
      });

      return {
        base,
        pagos,
        trabalhados,
        pagosDoFechamento: draft.pagos == null && salvo?.dias_pagos_anterior == null && !!anterior,
        diferenca,
        totalDias: deposito.diasPagos,
        depositar: deposito.depositar,
        desconto: deposito.desconto,
        fechada: !!salvo?.fechado_em,
      };
    });
  }, [vale.linhas, apuracoes.atual, apuracoes.anteriores, edits]);

  const totais = useMemo(
    () => ({
      valor: Math.round(linhas.reduce((s, l) => s + l.depositar, 0) * 100) / 100,
      dias: linhas.reduce((s, l) => s + l.totalDias, 0),
      diferenca: linhas.reduce((s, l) => s + l.diferenca, 0),
      colaboradores: linhas.length,
      fechadas: linhas.filter((l) => l.fechada).length,
    }),
    [linhas],
  );

  const persistir = (l: LinhaCalculo, pagos: string, trabalhados: string) => {
    const pagosNum = pagos === "" ? 0 : Number(pagos);
    const trabalhadosNum = trabalhados === "" ? null : Number(trabalhados);
    const diferenca = diferencaCicloAnterior(pagosNum, trabalhadosNum);
    const deposito = calcularVaDeposito({
      diasPrevistos: l.base.diasPrevistos,
      diasDescontados: 0,
      diferencaAnterior: diferenca,
      valorDia: l.base.valorDia,
      descontoColaborador: l.base.descontoColaborador,
    });
    apuracoes.salvarDias.mutate({
      colaborador_id: l.base.colaborador_id,
      dias_pagos_anterior: pagosNum,
      dias_trabalhados_anterior: trabalhadosNum,
      dias_previstos: l.base.diasPrevistos,
      total_dias: deposito.diasPagos,
      valor_dia: l.base.valorDia,
      valor_depositar: deposito.depositar,
    });
  };

  const editar = (l: LinhaCalculo, campo: "pagos" | "trabalhados", bruto: string) => {
    const valor = soDigitos(bruto);
    const proximo = {
      pagos: campo === "pagos" ? valor : l.pagos,
      trabalhados: campo === "trabalhados" ? valor : l.trabalhados,
    };
    setEdits((prev) => ({ ...prev, [l.base.colaborador_id]: proximo }));
    clearTimeout(timers.current[l.base.colaborador_id]);
    timers.current[l.base.colaborador_id] = setTimeout(
      () => persistir(l, proximo.pagos, proximo.trabalhados),
      700,
    );
  };

  const fechar = () => {
    const payload: FecharLinha[] = linhas.map((l) => ({
      colaborador_id: l.base.colaborador_id,
      dias_pagos_anterior: l.pagos === "" ? 0 : Number(l.pagos),
      dias_trabalhados_anterior: l.trabalhados === "" ? null : Number(l.trabalhados),
      dias_previstos: l.base.diasPrevistos,
      total_dias: l.totalDias,
      valor_dia: l.base.valorDia,
      valor_depositar: l.depositar,
    }));
    apuracoes.fecharCiclo.mutate(payload);
  };

  const exportar = () => {
    const cab = [
      "Colaborador", "Unidade", "Valor do dia", "Dias a trabalhar (ciclo atual)",
      "Dias pagos (ciclo anterior)", "Dias trabalhados (ciclo anterior)", "Diferenca",
      "Total de dias", "Desconto", "A depositar",
    ].join(";");
    const corpo = linhas.map((l) =>
      [
        l.base.nome, l.base.unidade_nome ?? "", l.base.valorDia.toFixed(2).replace(".", ","),
        l.base.diasPrevistos, l.pagos === "" ? 0 : l.pagos, l.trabalhados === "" ? "" : l.trabalhados,
        l.diferenca, l.totalDias,
        l.desconto.toFixed(2).replace(".", ","),
        l.depositar.toFixed(2).replace(".", ","),
      ].join(";"),
    );
    baixarCsv(
      `${tipo === "va" ? "vale-alimentacao" : "vale-transporte"}-${competencia}.csv`,
      [cab, ...corpo].join("\n"),
    );
  };

  const origemTexto = (l: LinhaVale) =>
    l.origemPrevistos === "escala"
      ? "escala publicada"
      : l.origemPrevistos === "convocacao"
        ? "convocações aceitas"
        : "jornada habitual";

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
          <div className="flex flex-col justify-end gap-2 sm:flex-row">
            <Button variant="secondary" className="w-full" onClick={exportar} disabled={linhas.length === 0}>
              <Download className="mr-2 size-4" /> Exportar CSV
            </Button>
            <Button
              className="w-full"
              onClick={fechar}
              disabled={linhas.length === 0 || apuracoes.fecharCiclo.isPending}
            >
              <CheckCircle2 className="mr-2 size-4" /> Fechar ciclo
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Pagamento em <strong className="text-foreground">{dataCurta(vale.periodo.pagamento)}</strong>, com corte em{" "}
            <strong className="text-foreground">{dataCurta(vale.periodo.corte)}</strong>. O depósito cobre{" "}
            {dataCurta(vale.periodo.cobertura.inicio)} a {dataCurta(vale.periodo.cobertura.fim)}. Ao total de dias
            do ciclo atual soma-se a diferença do ciclo anterior (dias trabalhados − dias pagos), que pode ser
            positiva ou negativa. Informe os dias trabalhados do ciclo anterior; os dias pagos vêm do ciclo já
            fechado, quando existir.
            {tipo === "vt" && " O desconto exibido é o limite legal de 6% do salário."}
          </span>
        </div>
      </DpContentCard>

      {(vale.isError || apuracoes.isError) && (
        <DpErrorState onRetry={() => { vale.refetchAll(); apuracoes.refetch(); }} />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total a depositar", value: brl(totais.valor) },
          { label: "Total de dias", value: String(totais.dias) },
          {
            label: "Diferença do ciclo anterior",
            value: `${totais.diferenca > 0 ? "+" : ""}${totais.diferenca} dia(s)`,
          },
          { label: "Colaboradores", value: String(totais.colaboradores) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <Calculator className="size-5 text-primary" />
            <p className="mt-2 text-lg font-bold sm:text-xl">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <DpContentCard>
        {vale.isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Calculando…</p>
        ) : linhas.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum colaborador com {label.toLowerCase()} ativo nesta seleção.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {linhas.map((l) => (
              <div key={l.base.colaborador_id} className="space-y-3 px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {l.base.nome}
                      {l.base.unidade_nome ? (
                        <span className="text-muted-foreground"> · {l.base.unidade_nome}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {brl(l.base.valorDia)}/dia · paga dia {l.base.periodo.pagamento.slice(-2)} ·{" "}
                      {l.base.diasPrevistos} dia(s) no ciclo atual ({origemTexto(l.base)})
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.fechada && <Badge variant="secondary" className="text-[11px]">Ciclo fechado</Badge>}
                      {l.base.semValorDia && (
                        <Badge variant="destructive" className="text-[11px]">Sem valor por dia cadastrado</Badge>
                      )}
                      {l.base.aviso && <Badge variant="outline" className="text-[11px]">{l.base.aviso}</Badge>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{brl(l.depositar)}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.totalDias} dia(s)
                      {l.diferenca !== 0 && ` · ${l.diferenca > 0 ? "+" : ""}${l.diferenca} do ciclo anterior`}
                      {l.desconto > 0 && ` · desconto ${brl(l.desconto)}`}
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-primary underline-offset-2 hover:underline"
                      onClick={() => setMemoria(l.base)}
                    >
                      Ver memória de cálculo
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Dias pagos (ciclo anterior)
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={l.pagos}
                      placeholder="0"
                      onChange={(e) => editar(l, "pagos", e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {l.pagosDoFechamento ? "Preenchido pelo ciclo anterior fechado." : "Informe se não houver ciclo fechado."}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Dias trabalhados (ciclo anterior)
                    </Label>
                    <Input
                      inputMode="numeric"
                      value={l.trabalhados}
                      placeholder="Informe os dias"
                      onChange={(e) => editar(l, "trabalhados", e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Sugestão pela escala: {l.base.sugestaoTrabalhadosAnterior} dia(s).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Diferença aplicada
                    </Label>
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                      {l.trabalhados === "" ? (
                        <span className="text-muted-foreground">Aguardando os dias trabalhados</span>
                      ) : (
                        <span className={l.diferenca < 0 ? "text-destructive" : "text-foreground"}>
                          {l.diferenca > 0 ? "+" : ""}{l.diferenca} dia(s)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {l.base.diasPrevistos} + ({l.trabalhados === "" ? 0 : l.trabalhados} − {l.pagos === "" ? 0 : l.pagos}) = {l.totalDias} dia(s)
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DpContentCard>

      <ValeMemoriaDialog
        open={!!memoria}
        onOpenChange={(o) => !o && setMemoria(null)}
        linha={memoria}
        valeLabel={label}
      />
    </div>
  );
}
