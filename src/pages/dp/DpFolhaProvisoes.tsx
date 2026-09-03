import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { CalendarDays, Gift, Receipt } from "lucide-react";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useDpFolhaDecimoTerceiro, useDpFolhaFerias } from "@/hooks/useDpProvisoes";
import { formatarBRL } from "@/lib/dp/folha";

const competenciaAtual = new Date().toISOString().slice(0, 7);

interface LinhaPreviaProps {
  nome: string;
  detalhe: string;
  bruto: number;
  liquido: number;
  alerta?: boolean;
}

function LinhaPrevia({ nome, detalhe, bruto, liquido, alerta }: LinhaPreviaProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{nome}</p>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </div>
      {alerta ? (
        <Badge variant="destructive">Sem salário base</Badge>
      ) : (
        <div className="text-right">
          <p className="text-sm font-semibold">{formatarBRL(liquido)}</p>
          <p className="text-xs text-muted-foreground">bruto {formatarBRL(bruto)}</p>
        </div>
      )}
    </li>
  );
}

export default function DpFolhaProvisoes() {
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [parcela, setParcela] = useState<"1" | "2">("1");

  const ferias = useDpFolhaFerias(competencia);
  const decimo = useDpFolhaDecimoTerceiro(Number(ano), parcela === "1" ? 1 : 2);

  return (
    <DpPage>
      <Helmet>
        <title>Férias e 13º na Folha | Pessoas Aveto 360</title>
        <meta
          name="description"
          content="Gere recibos de férias e as parcelas do 13º salário como lançamentos da folha de pagamento."
        />
      </Helmet>

      <DpPageHeader
        title="Férias e 13º Salário"
        description="Gere recibos de férias da competência e as parcelas do 13º como lançamentos em rascunho."
        icon={Gift}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/dp/folha">
              <Receipt className="mr-2 h-4 w-4" />
              Folha de Pagamento
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="ferias">
        <TabsList className="w-full">
          <TabsTrigger value="ferias" className="flex-1">Férias</TabsTrigger>
          <TabsTrigger value="decimo" className="flex-1">13º salário</TabsTrigger>
        </TabsList>

        <TabsContent value="ferias" className="space-y-4">
          <DpFilterCard>
            <div className="space-y-1.5">
              <Label htmlFor="competencia-ferias">Competência</Label>
              <Input
                id="competencia-ferias"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value || competenciaAtual)}
              />
            </div>
          </DpFilterCard>

          {ferias.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <DpContentCard className="p-0">
              {!ferias.previa.length ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Nenhuma férias aprovada com início nesta competência.
                </p>
              ) : (
                <>
                  <ul className="divide-y">
                    {ferias.previa.map((p) => (
                      <LinhaPrevia
                        key={p.gozoId}
                        nome={p.nome}
                        detalhe={p.rubricas.map((r) => r.descricao).join(" · ") || "Sem rubricas calculadas"}
                        bruto={p.bruto}
                        liquido={p.liquido}
                        alerta={p.semSalario}
                      />
                    ))}
                  </ul>
                  <div className="flex justify-end border-t p-4">
                    <Button onClick={() => ferias.gerar.mutate()} disabled={ferias.gerar.isPending}>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      Gerar Recibos de Férias
                    </Button>
                  </div>
                </>
              )}
            </DpContentCard>
          )}
        </TabsContent>

        <TabsContent value="decimo" className="space-y-4">
          <DpFilterCard>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ano-13">Ano-base</Label>
                <Input
                  id="ano-13"
                  inputMode="numeric"
                  value={ano}
                  onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Parcela</Label>
                <Select value={parcela} onValueChange={(v) => setParcela(v as "1" | "2")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1ª parcela (adiantamento, sem encargos)</SelectItem>
                    <SelectItem value="2">2ª parcela (com INSS e IRRF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DpFilterCard>

          {decimo.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <DpContentCard className="p-0">
              {!decimo.previa.length ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum colaborador ativo encontrado.</p>
              ) : (
                <>
                  <ul className="divide-y">
                    {decimo.previa.map((p) => (
                      <LinhaPrevia
                        key={p.colaboradorId}
                        nome={p.nome}
                        detalhe={`${p.avos}/12 avos · ${parcela}ª parcela`}
                        bruto={p.bruto}
                        liquido={p.liquido}
                        alerta={p.semSalario}
                      />
                    ))}
                  </ul>
                  <div className="flex justify-end border-t p-4">
                    <Button onClick={() => decimo.gerar.mutate()} disabled={decimo.gerar.isPending}>
                      <Gift className="mr-2 h-4 w-4" />
                      Gerar 13º ({parcela}ª parcela)
                    </Button>
                  </div>
                </>
              )}
            </DpContentCard>
          )}
        </TabsContent>
      </Tabs>
    </DpPage>
  );
}
