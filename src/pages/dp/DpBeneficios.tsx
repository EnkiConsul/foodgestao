import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gift, Plus, Pencil, Trash2, Users, Wallet, PlayCircle } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { DpErrorState } from "@/components/dp/DpErrorState";
import {
  useDpBeneficios, type Beneficio, type ColaboradorBeneficio,
} from "@/hooks/useDpBeneficios";
import {
  AtribuicaoDialog, BeneficioDialog, BENEFICIO_TIPO_LABEL,
} from "@/components/dp/beneficios/BeneficiosDialogs";

const fmtData = (iso?: string | null) =>
  iso ? format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }) : "—";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DpBeneficios() {
  const { data: colaboradores = [] } = useDpColaboradores();
  const [colabFilter, setColabFilter] = useState("todos");
  const b = useDpBeneficios(colabFilter);

  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<Beneficio | null>(null);
  const [atrOpen, setAtrOpen] = useState(false);
  const [atrEdit, setAtrEdit] = useState<ColaboradorBeneficio | null>(null);
  const [periodoId, setPeriodoId] = useState<string>("");

  const kpis = useMemo(() => {
    const ativos = b.atribuicoes.filter((a) => a.ativo);
    const custo = ativos.reduce((s, a) => s + Number(a.valor ?? 0), 0);
    const desconto = ativos.reduce((s, a) => s + Number(a.desconto_valor ?? 0), 0);
    return {
      catalogo: b.beneficios.filter((x) => x.ativo).length,
      colaboradores: new Set(ativos.map((a) => a.colaborador_id)).size,
      custo,
      liquido: custo - desconto,
    };
  }, [b.beneficios, b.atribuicoes]);

  const colabList = colaboradores.map((x) => ({ id: x.id, nome: x.nome }));

  return (
    <DpPage>
      <Helmet><title>Benefícios e auxílios — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Gift}
        title="Benefícios"
        description="Catálogo de benefícios (VT, VA/VR, saúde) e ficha por colaborador, com geração automática na folha."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Benefícios ativos", value: String(kpis.catalogo), icon: Gift, tone: "text-primary" },
          { label: "Colaboradores atendidos", value: String(kpis.colaboradores), icon: Users, tone: "text-primary" },
          { label: "Custo bruto mensal", value: brl(kpis.custo), icon: Wallet, tone: "text-amber-600" },
          { label: "Custo líquido (após desconto)", value: brl(kpis.liquido), icon: Wallet, tone: "text-emerald-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <k.icon className={`size-5 ${k.tone}`} />
            <p className="mt-2 text-xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <DpContentCard contentClassName="p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Colaborador</Label>
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
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Gerar na folha
            </Label>
            <div className="flex gap-2">
              <Select value={periodoId} onValueChange={setPeriodoId}>
                <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Selecione o período" /></SelectTrigger>
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
                className="shrink-0"
                disabled={!periodoId || b.gerarLancamentos.isPending}
                onClick={() => b.gerarLancamentos.mutate(periodoId)}
              >
                <PlayCircle className="mr-2 size-4" /> Gerar
              </Button>
            </div>
          </div>
        </div>
      </DpContentCard>

      {b.isError && <DpErrorState onRetry={b.refetchAll} className="mb-3" />}

      <Tabs defaultValue="ficha" className="space-y-3">
        <TabsList className="flex w-full sm:w-auto">
          <TabsTrigger value="ficha" className="flex-1 sm:flex-none">Por colaborador</TabsTrigger>
          <TabsTrigger value="catalogo" className="flex-1 sm:flex-none">Catálogo</TabsTrigger>
        </TabsList>

        <TabsContent value="ficha" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => { setAtrEdit(null); setAtrOpen(true); }}>
              <Plus className="mr-2 size-4" /> Atribuir benefício
            </Button>
          </div>
          <DpContentCard>
            {b.atribuicoes.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum benefício atribuído.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {b.atribuicoes.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.colaborador_nome} · {a.beneficio_nome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {brl(Number(a.valor ?? 0))}
                        {Number(a.desconto_valor ?? 0) > 0 &&
                          ` · desconto ${brl(Number(a.desconto_valor))}`}
                        {" · "}{fmtData(a.data_inicio)}
                        {a.data_fim ? ` até ${fmtData(a.data_fim)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!a.ativo && <Badge variant="secondary">Inativo</Badge>}
                      <Button size="icon" variant="ghost" aria-label="Editar atribuição"
                        onClick={() => { setAtrEdit(a); setAtrOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remover atribuição"
                        onClick={() => b.deleteAtribuicao.mutate(a.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="catalogo" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => { setCatEdit(null); setCatOpen(true); }}>
              <Plus className="mr-2 size-4" /> Novo benefício
            </Button>
          </div>
          <DpContentCard>
            {b.beneficios.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum benefício cadastrado.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {b.beneficios.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{x.nome}</p>
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
    </DpPage>
  );
}
