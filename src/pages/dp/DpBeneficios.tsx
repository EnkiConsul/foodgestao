import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Gift, Plus, Pencil, Trash2, Users, Wallet, PlayCircle } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { DpStatCard, DpStatGrid } from "@/components/dp/DpStatCard";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";

import { DpErrorState } from "@/components/dp/DpErrorState";
import {
  useDpBeneficios, type Beneficio, type ColaboradorBeneficio,
} from "@/hooks/useDpBeneficios";
import { useDpBeneficiosCadastro, type BeneficioCadastroItem } from "@/hooks/useDpBeneficiosCadastro";
import {
  AtribuicaoDialog, BeneficioDialog, BENEFICIO_TIPO_LABEL,
} from "@/components/dp/beneficios/BeneficiosDialogs";
import { ValeCalculadora } from "@/components/dp/beneficios/ValeCalculadora";
import { ValeHistorico } from "@/components/dp/beneficios/ValeHistorico";
import { ValesCadastroCard } from "@/components/dp/beneficios/ValesCadastroCard";


import type { ValeTipo } from "@/hooks/useDpValeCalculadora";

import { ColaboradorFichaDialog } from "@/components/dp/ColaboradorFichaDialog";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DpBeneficios() {
  const { data: colaboradores = [] } = useDpColaboradores();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();

  const [colabFilter, setColabFilter] = useState("todos");
  const b = useDpBeneficios(colabFilter);
  const cadastro = useDpBeneficiosCadastro(colabFilter);

  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<Beneficio | null>(null);
  const [atrOpen, setAtrOpen] = useState(false);
  const [atrEdit, setAtrEdit] = useState<ColaboradorBeneficio | null>(null);
  const [periodoId, setPeriodoId] = useState<string>("");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [valeTipo, setValeTipo] = useState<ValeTipo>("va");

  const fichaColaborador = useMemo(
    () => colaboradores.find((c: any) => c.id === fichaId) ?? null,
    [colaboradores, fichaId],
  );


  const kpis = useMemo(() => {
    const ativos = b.atribuicoes.filter((a) => a.ativo);
    const custoCatalogo = ativos.reduce((s, a) => s + Number(a.valor ?? 0), 0);
    const descontoCatalogo = ativos.reduce((s, a) => s + Number(a.desconto_valor ?? 0), 0);
    const custoCadastro = cadastro.itens.reduce((s, i) => s + i.bruto, 0);
    const descontoCadastro = cadastro.itens.reduce((s, i) => s + i.desconto, 0);
    const custo = custoCatalogo + custoCadastro;
    const desconto = descontoCatalogo + descontoCadastro;
    const pessoas = new Set([
      ...ativos.map((a) => a.colaborador_id),
      ...cadastro.itens.map((i) => i.colaborador_id),
    ]);
    return {
      itens: ativos.length + cadastro.itens.length,
      colaboradores: pessoas.size,
      custo,
      liquido: custo - desconto,
    };
  }, [b.atribuicoes, cadastro.itens]);

  const colabList = colaboradores.map((x) => ({ id: x.id, nome: x.nome }));

  return (
    <DpPage>
      <Helmet><title>Benefícios e auxílios — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Gift}
        title="Benefícios"
        description="Vale-alimentação, vale-transporte e demais benefícios da empresa, com as mesmas regras da ficha do colaborador e geração automática na folha."
      />

      <DpStatGrid>
        <DpStatCard icon={Gift} label="Benefícios ativos" value={String(kpis.itens)} />
        <DpStatCard icon={Users} label="Colaboradores atendidos" value={String(kpis.colaboradores)} />
        <DpStatCard icon={Wallet} label="Custo bruto mensal" value={brl(kpis.custo)} tone="warning" />
        <DpStatCard
          icon={Wallet}
          label="Custo líquido (após desconto)"
          value={brl(kpis.liquido)}
          tone="success"
        />
      </DpStatGrid>

      <DpContentCard contentClassName="p-3 sm:p-4 md:p-5">
        <div className="max-w-sm space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Colaborador</Label>
          <Select value={colabFilter} onValueChange={setColabFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="todos">Todos</SelectItem>
              {colabList.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DpContentCard>


      {(b.isError || cadastro.isError) && (
        <DpErrorState
          onRetry={() => { b.refetchAll(); cadastro.refetch(); }}
          className="mb-3"
        />
      )}

      <Tabs defaultValue="calculo" className="space-y-3 pb-24 md:pb-0">
        <DpTabsBar>
          <TabsTrigger value="calculo">Cálculo Mensal</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="catalogo">Cadastro de Benefícios</TabsTrigger>



        </DpTabsBar>

        <TabsContent value="calculo" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["va", "vt"] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={valeTipo === t ? "default" : "outline"}
                onClick={() => setValeTipo(t)}
              >
                {t === "va" ? "Vale-alimentação" : "Vale-transporte"}
              </Button>
            ))}
          </div>
          <ValeCalculadora tipo={valeTipo} />
        </TabsContent>

        <TabsContent value="historico" className="space-y-3">
          <ValeHistorico />
        </TabsContent>




        <TabsContent value="catalogo" className="space-y-3">
          <ValesCadastroCard
            unidades={(unidades.data ?? []).map((u: any) => ({ id: u.id, nome: u.nome }))}
            cargos={(cargos.data ?? []).map((c: any) => ({ id: c.id, nome: c.nome }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => { setAtrEdit(null); setAtrOpen(true); }}
            >
              <Plus className="mr-2 size-4" /> Atribuir a Colaborador
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => { setCatEdit(null); setCatOpen(true); }}
            >
              <Plus className="mr-2 size-4" /> Novo Benefício
            </Button>
          </div>


          <DpContentCard>
            {b.beneficios.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum benefício cadastrado no catálogo.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {b.beneficios.map((x) => (
                  <div
                    key={x.id}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{x.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {BENEFICIO_TIPO_LABEL[x.tipo]} · {brl(Number(x.valor_padrao ?? 0))}
                        {Number(x.desconto_percentual ?? 0) > 0 &&
                          ` · desconto ${Number(x.desconto_percentual)}%`}
                        {x.folha_tipo ? " · entra na folha" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!x.ativo && <Badge variant="secondary">Inativo</Badge>}
                      <Button size="icon" variant="ghost" aria-label="Editar benefício"
                        onClick={() => { setCatEdit(x); setCatOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remover benefício"
                        onClick={() => b.deleteBeneficio.mutate(x.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>
        </TabsContent>
      </Tabs>

      <BeneficioDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        editing={catEdit}
        saving={b.saveBeneficio.isPending}
        unidades={(unidades.data ?? []).map((u: any) => ({ id: u.id, nome: u.nome }))}
        cargos={(cargos.data ?? []).map((c: any) => ({ id: c.id, nome: c.nome }))}

        onSubmit={(input) =>
          b.saveBeneficio.mutate(input, { onSuccess: () => setCatOpen(false) })
        }
      />
      <AtribuicaoDialog
        open={atrOpen}
        onOpenChange={setAtrOpen}
        colaboradores={colabList}
        beneficios={b.beneficios}
        editing={atrEdit}
        saving={b.saveAtribuicao.isPending}
        onSubmit={(input) =>
          b.saveAtribuicao.mutate(input, { onSuccess: () => setAtrOpen(false) })
        }
      />
      {fichaColaborador && (
        <ColaboradorFichaDialog
          open={!!fichaColaborador}
          onOpenChange={(o) => !o && setFichaId(null)}
          colaborador={fichaColaborador as any}
          onEdit={() => setFichaId(null)}
        />

      )}
    </DpPage>
  );
}
