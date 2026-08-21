import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gift, Plus, Pencil, Trash2, Users, Wallet, PlayCircle, ExternalLink } from "lucide-react";
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
import { DpErrorState } from "@/components/dp/DpErrorState";
import {
  useDpBeneficios, type Beneficio, type ColaboradorBeneficio,
} from "@/hooks/useDpBeneficios";
import { useDpBeneficiosCadastro, type BeneficioCadastroItem } from "@/hooks/useDpBeneficiosCadastro";
import {
  AtribuicaoDialog, BeneficioDialog, BENEFICIO_TIPO_LABEL,
} from "@/components/dp/beneficios/BeneficiosDialogs";
import { ValeCalculadora } from "@/components/dp/beneficios/ValeCalculadora";
import type { ValeTipo } from "@/hooks/useDpValeCalculadora";

import { ColaboradorFichaDialog } from "@/components/dp/ColaboradorFichaDialog";

const fmtData = (iso?: string | null) =>
  iso ? format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }) : "—";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type LinhaCatalogo = { origem: "catalogo"; nome: string; item: ColaboradorBeneficio };
type LinhaCadastro = { origem: "cadastro"; nome: string; item: BeneficioCadastroItem };
type Linha = LinhaCatalogo | LinhaCadastro;

export default function DpBeneficios() {
  const { data: colaboradores = [] } = useDpColaboradores();
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

  /** Ficha unificada: benefícios do cadastro do colaborador + atribuições do catálogo. */
  const linhas = useMemo<Linha[]>(() => {
    const doCadastro: Linha[] = cadastro.itens.map((item) => ({
      origem: "cadastro",
      nome: item.colaborador_nome,
      item,
    }));
    const doCatalogo: Linha[] = b.atribuicoes.map((item) => ({
      origem: "catalogo",
      nome: item.colaborador_nome ?? "",
      item,
    }));
    return [...doCadastro, ...doCatalogo].sort((a, b2) => a.nome.localeCompare(b2.nome));
  }, [cadastro.itens, b.atribuicoes]);

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
        description="Benefícios do cadastro do colaborador (VA/VT) e catálogo da empresa, com geração automática na folha."
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Gerar na folha</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={periodoId} onValueChange={setPeriodoId}>
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {b.periodos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {format(parseISO(p.competencia), "MM/yyyy")} — {p.tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                className="w-full sm:w-auto sm:shrink-0"
                disabled={!periodoId || b.gerarLancamentos.isPending}
                onClick={() => b.gerarLancamentos.mutate(periodoId)}
              >
                <PlayCircle className="mr-2 size-4" /> Gerar
              </Button>
            </div>
          </div>
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
          <TabsTrigger value="calculo">Cálculo mensal</TabsTrigger>
          <TabsTrigger value="ficha">Por colaborador</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
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


        <TabsContent value="ficha" className="space-y-3">
          <Button
            className="w-full sm:w-auto sm:ml-auto sm:flex"
            onClick={() => { setAtrEdit(null); setAtrOpen(true); }}
          >
            <Plus className="mr-2 size-4" /> Atribuir benefício
          </Button>
          <DpContentCard>
            {linhas.length === 0 ? (
              <div className="space-y-2 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum benefício encontrado. Os benefícios podem vir da ficha do colaborador
                  (vale-alimentação e vale-transporte, na aba Remuneração) ou do catálogo da empresa.
                </p>
                <Button variant="secondary" onClick={() => { setAtrEdit(null); setAtrOpen(true); }}>
                  <Plus className="mr-2 size-4" /> Atribuir benefício do catálogo
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {linhas.map((linha) =>
                  linha.origem === "cadastro" ? (
                    <div
                      key={linha.item.id}
                      className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">
                          {linha.item.colaborador_nome} · {linha.item.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {brl(linha.item.bruto)}
                          {linha.item.desconto > 0 && ` · desconto ${brl(linha.item.desconto)}`}
                          {` · ${linha.item.detalhe}`}
                          {linha.item.diaPagamento ? ` · paga dia ${linha.item.diaPagamento}` : ""}
                        </p>
                        {linha.item.aviso && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {linha.item.aviso}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary">Do cadastro</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setFichaId(linha.item.colaborador_id)}
                        >
                          <ExternalLink className="mr-1.5 size-4" /> Ficha
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={linha.item.id}
                      className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">
                          {linha.item.colaborador_nome} · {linha.item.beneficio_nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {brl(Number(linha.item.valor ?? 0))}
                          {Number(linha.item.desconto_valor ?? 0) > 0 &&
                            ` · desconto ${brl(Number(linha.item.desconto_valor))}`}
                          {" · "}{fmtData(linha.item.data_inicio)}
                          {linha.item.data_fim ? ` até ${fmtData(linha.item.data_fim)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!linha.item.ativo && <Badge variant="secondary">Inativo</Badge>}
                        <Button size="icon" variant="ghost" aria-label="Editar atribuição"
                          onClick={() => { setAtrEdit(linha.item); setAtrOpen(true); }}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Remover atribuição"
                          onClick={() => b.deleteAtribuicao.mutate(linha.item.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="catalogo" className="space-y-3">
          <Button
            className="w-full sm:w-auto sm:ml-auto sm:flex"
            onClick={() => { setCatEdit(null); setCatOpen(true); }}
          >
            <Plus className="mr-2 size-4" /> Novo benefício
          </Button>
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

        <TabsContent value="va">
          <ValeCalculadora tipo="va" />
        </TabsContent>

        <TabsContent value="vt">
          <ValeCalculadora tipo="vt" />
        </TabsContent>
      </Tabs>

      <BeneficioDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        editing={catEdit}
        saving={b.saveBeneficio.isPending}
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
