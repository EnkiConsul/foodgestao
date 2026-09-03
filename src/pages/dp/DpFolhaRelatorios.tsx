import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { BarChart3, Download, Receipt } from "lucide-react";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpFolhaRelatorios } from "@/hooks/useDpFolhaRelatorios";
import { FOLHA_TIPO_LABEL, formatarBRL } from "@/lib/dp/folha";
import { resumoAnualParaCsv, resumoMensalParaCsv } from "@/lib/dp/folha-relatorios";

const baixarCsv = (nome: string, conteudo: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

const nomeDoMes = (competencia: string) =>
  new Date(`${competencia}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-base font-semibold">{valor}</p>
    </div>
  );
}

export default function DpFolhaRelatorios() {
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [unidade, setUnidade] = useState<string>("todas");
  const { data: unidades } = useDpUnidades();
  const { total, mensal, porColaborador, porTipo, isLoading, error } = useDpFolhaRelatorios(
    Number(ano) || new Date().getFullYear(),
    unidade,
  );

  if (error) return <DpErrorState message="Não foi possível carregar os relatórios da folha." />;

  return (
    <DpPage>
      <Helmet>
        <title>Relatórios da Folha | Pessoas Aveto 360</title>
        <meta
          name="description"
          content="Resumo anual e mensal da folha de pagamento com INSS, IRRF, FGTS e rendimentos por colaborador."
        />
      </Helmet>

      <DpPageHeader
        title="Relatórios da Folha"
        description="Consolidado do ano por competência, por tipo de pagamento e por colaborador."
        icon={BarChart3}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/dp/folha">
              <Receipt className="mr-2 h-4 w-4" />
              Folha de Pagamento
            </Link>
          </Button>
        }
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ano-relatorio">Ano</Label>
            <Input
              id="ano-relatorio"
              inputMode="numeric"
              value={ano}
              onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {(unidades ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DpFilterCard>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Total bruto" valor={formatarBRL(total.bruto)} />
            <Indicador rotulo="Total líquido" valor={formatarBRL(total.liquido)} />
            <Indicador rotulo="INSS retido" valor={formatarBRL(total.inss)} />
            <Indicador rotulo="IRRF retido" valor={formatarBRL(total.irrf)} />
            <Indicador rotulo="FGTS (informativo)" valor={formatarBRL(total.fgts)} />
            <Indicador rotulo="Outros descontos" valor={formatarBRL(total.outrosDescontos)} />
            <Indicador rotulo="Colaboradores" valor={String(total.colaboradores)} />
            <Indicador rotulo="Lançamentos" valor={String(total.lancamentos)} />
          </div>

          <Tabs defaultValue="mensal">
            <TabsList className="w-full">
              <TabsTrigger value="mensal" className="flex-1">Por mês</TabsTrigger>
              <TabsTrigger value="colaborador" className="flex-1">Por colaborador</TabsTrigger>
              <TabsTrigger value="tipo" className="flex-1">Por tipo</TabsTrigger>
            </TabsList>

            <TabsContent value="mensal">
              <DpContentCard className="p-0">
                <ul className="divide-y">
                  {mensal.map((m) => (
                    <li key={m.competencia} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium first-letter:uppercase">{nomeDoMes(m.competencia)}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.colaboradores} colaborador(es) · INSS {formatarBRL(m.inss)} · IRRF {formatarBRL(m.irrf)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatarBRL(m.liquido)}</p>
                        <p className="text-xs text-muted-foreground">bruto {formatarBRL(m.bruto)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end border-t p-4">
                  <Button
                    variant="outline"
                    onClick={() => baixarCsv(`folha-resumo-${ano}.csv`, resumoMensalParaCsv(Number(ano), mensal))}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Resumo Mensal
                  </Button>
                </div>
              </DpContentCard>
            </TabsContent>

            <TabsContent value="colaborador">
              <DpContentCard className="p-0">
                {!porColaborador.length ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento no ano selecionado.</p>
                ) : (
                  <>
                    <ul className="divide-y">
                      {porColaborador.map((c) => (
                        <li key={c.colaboradorId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{c.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.lancamentos} lançamento(s) · INSS {formatarBRL(c.inss)} · IRRF {formatarBRL(c.irrf)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatarBRL(c.liquido)}</p>
                            <p className="text-xs text-muted-foreground">bruto {formatarBRL(c.bruto)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-end border-t p-4">
                      <Button
                        variant="outline"
                        onClick={() =>
                          baixarCsv(`rendimentos-${ano}.csv`, resumoAnualParaCsv(Number(ano), porColaborador))
                        }
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Exportar Rendimentos
                      </Button>
                    </div>
                  </>
                )}
              </DpContentCard>
            </TabsContent>

            <TabsContent value="tipo">
              <DpContentCard className="p-0">
                {!porTipo.length ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum lançamento no ano selecionado.</p>
                ) : (
                  <ul className="divide-y">
                    {porTipo.map((t) => (
                      <li key={t.tipo} className="flex items-center justify-between gap-3 p-3">
                        <div>
                          <p className="text-sm font-medium">{FOLHA_TIPO_LABEL[t.tipo] ?? t.tipo}</p>
                          <p className="text-xs text-muted-foreground">{t.lancamentos} lançamento(s)</p>
                        </div>
                        <span className="text-sm font-semibold">{formatarBRL(t.bruto)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </DpContentCard>
            </TabsContent>
          </Tabs>
        </>
      )}
    </DpPage>
  );
}
