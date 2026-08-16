import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { FileSignature, Receipt } from "lucide-react";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  RESCISAO_PARAMS_PADRAO,
  calcularRescisao,
  useDpColaboradoresDesligados,
  useDpGerarRescisao,
  type RescisaoParams,
} from "@/hooks/useDpRescisao";
import { MOTIVO_DESLIGAMENTO_LABEL } from "@/lib/dp/desligamento";
import { formatarBRL } from "@/lib/dp/folha";

const numero = (v: string) => Number(v.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

export default function DpRescisoes() {
  const { desligados, isLoading } = useDpColaboradoresDesligados();
  const [selecionado, setSelecionado] = useState<string>("");
  const [params, setParams] = useState<RescisaoParams>(RESCISAO_PARAMS_PADRAO);
  const gerar = useDpGerarRescisao();

  const colab = useMemo(
    () => desligados.find((d) => d.id === selecionado) ?? null,
    [desligados, selecionado],
  );
  const calc = useMemo(() => calcularRescisao(colab, params), [colab, params]);
  const encargos = calc.detalhe;

  return (
    <DpPage>
      <Helmet>
        <title>Rescisões (TRCT) | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Calcule o acerto rescisório dos colaboradores desligados e gere o lançamento na folha de pagamento."
        />
      </Helmet>

      <DpPageHeader
        title="Rescisões (TRCT)"
        description="Calcule as verbas rescisórias do desligamento e gere o acerto final na folha."
        icon={FileSignature}
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
        <div className="space-y-1.5">
          <Label>Colaborador desligado</Label>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selecionado} onValueChange={setSelecionado}>
              <SelectTrigger>
                <SelectValue placeholder={desligados.length ? "Selecione" : "Nenhum desligamento registrado"} />
              </SelectTrigger>
              <SelectContent>
                {desligados.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nome} — {new Date(`${d.dataDesligamento}T12:00:00`).toLocaleDateString("pt-BR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </DpFilterCard>

      {colab && (
        <>
          <DpContentCard className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{MOTIVO_DESLIGAMENTO_LABEL[colab.motivo]}</Badge>
              {colab.cargo && <Badge variant="outline">{colab.cargo}</Badge>}
              <Badge variant="outline">
                Salário base {colab.salarioBase ? formatarBRL(colab.salarioBase) : "não informado"}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ferias-vencidas">Dias de férias vencidas</Label>
                <Input
                  id="ferias-vencidas"
                  inputMode="numeric"
                  value={params.diasFeriasVencidas}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, diasFeriasVencidas: Math.min(30, numero(e.target.value)) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saldo-fgts">Saldo de FGTS (para a multa)</Label>
                <Input
                  id="saldo-fgts"
                  inputMode="decimal"
                  value={params.saldoFgts}
                  onChange={(e) => setParams((p) => ({ ...p, saldoFgts: numero(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dependentes">Dependentes (IRRF)</Label>
                <Input
                  id="dependentes"
                  inputMode="numeric"
                  value={params.dependentes}
                  onChange={(e) => setParams((p) => ({ ...p, dependentes: numero(e.target.value) }))}
                />
              </div>
              {colab.motivo === "pedido_demissao" && (
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <Label htmlFor="aviso" className="text-sm font-normal">
                    Descontar aviso prévio não cumprido
                  </Label>
                  <Switch
                    id="aviso"
                    checked={params.descontarAvisoNaoCumprido}
                    onCheckedChange={(v) => setParams((p) => ({ ...p, descontarAvisoNaoCumprido: v }))}
                  />
                </div>
              )}
            </div>
          </DpContentCard>

          <DpContentCard className="p-0">
            {!calc.rubricas.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                Cadastre o salário base do cargo e a data de admissão para calcular o TRCT.
              </p>
            ) : (
              <>
                <ul className="divide-y">
                  {calc.rubricas.map((r, i) => (
                    <li key={`${r.descricao}-${i}`} className="flex items-center justify-between gap-3 p-3">
                      <span className="text-sm">{r.descricao}</span>
                      <span
                        className={`text-sm font-medium ${r.natureza === "desconto" ? "text-destructive" : ""}`}
                      >
                        {r.natureza === "desconto" ? "- " : ""}
                        {formatarBRL(r.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <div className="space-y-1 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total bruto</span>
                    <span className="font-medium">{formatarBRL(calc.bruto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dependentes considerados</span>
                    <span>{encargos.dependentes ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span>Líquido a receber</span>
                    <span>{formatarBRL(calc.liquido)}</span>
                  </div>
                </div>
                <div className="flex justify-end border-t p-4">
                  <Button
                    onClick={() => gerar.mutate({ colab, params })}
                    disabled={gerar.isPending}
                  >
                    <FileSignature className="mr-2 h-4 w-4" />
                    Gerar Rescisão na Folha
                  </Button>
                </div>
              </>
            )}
          </DpContentCard>
        </>
      )}
    </DpPage>
  );
}
