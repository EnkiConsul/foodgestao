import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShieldCheck, Plus, Pencil, Trash2, AlertTriangle, HardHat, GraduationCap, Stethoscope,
} from "lucide-react";
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
  useDpConformidade, type Epi, type EpiEntrega, type ExameAso, type Treinamento,
  type TreinamentoParticipacao,
} from "@/hooks/useDpConformidade";
import {
  EXAME_RESULTADO_LABEL, EXAME_TIPO_LABEL, TREINAMENTO_STATUS_LABEL, EpiDialog,
  EpiEntregaDialog, ExameDialog, ParticipacaoDialog, TreinamentoDialog,
} from "@/components/dp/conformidade/ConformidadeDialogs";

const fmt = (iso?: string | null) => (iso ? format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR }) : "—");

function VencimentoBadge({ data, janela = 30 }: { data?: string | null; janela?: number }) {
  if (!data) return null;
  const dias = differenceInCalendarDays(parseISO(data), new Date());
  if (dias < 0) return <Badge className="bg-destructive/15 text-destructive">Vencido</Badge>;
  if (dias <= janela) return <Badge className="bg-amber-500/15 text-amber-600">Vence em {dias}d</Badge>;
  return null;
}

export default function DpConformidade() {
  const { data: colaboradores = [] } = useDpColaboradores();
  const [colabFilter, setColabFilter] = useState("todos");

  const c = useDpConformidade(colabFilter);

  const [exameOpen, setExameOpen] = useState(false);
  const [exameEdit, setExameEdit] = useState<ExameAso | null>(null);
  const [epiOpen, setEpiOpen] = useState(false);
  const [epiEdit, setEpiEdit] = useState<Epi | null>(null);
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [entregaEdit, setEntregaEdit] = useState<EpiEntrega | null>(null);
  const [treinoOpen, setTreinoOpen] = useState(false);
  const [treinoEdit, setTreinoEdit] = useState<Treinamento | null>(null);
  const [partOpen, setPartOpen] = useState(false);
  const [partEdit, setPartEdit] = useState<TreinamentoParticipacao | null>(null);

  const hoje = new Date();
  const kpis = useMemo(() => {
    const vencidoOu = (d?: string | null, janela = 30) =>
      !!d && differenceInCalendarDays(parseISO(d), hoje) <= janela;
    return {
      asoAlerta: c.exames.filter((e) => vencidoOu(e.data_vencimento)).length,
      epiAlerta: c.entregas.filter((e) => !e.data_devolucao && vencidoOu(e.data_troca_prevista, 15)).length,
      treinoAlerta: c.participacoes.filter((p) => vencidoOu(p.data_vencimento)).length,
      obrigatorios: c.treinamentos.filter((t) => t.obrigatorio && t.ativo).length,
    };
  }, [c.exames, c.entregas, c.participacoes, c.treinamentos, hoje]);

  const colabList = colaboradores.map((x) => ({ id: x.id, nome: x.nome }));

  return (
    <DpPage>
      <Helmet><title>SESMT — saúde e segurança ocupacional — DP 360°</title></Helmet>
      <DpPageHeader
        icon={ShieldCheck}
        title="SESMT"
        description="Saúde e segurança ocupacional: exames (ASO), ficha de EPI e treinamentos obrigatórios por colaborador."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "ASO vencendo/vencidos", value: kpis.asoAlerta, icon: Stethoscope, tone: "text-destructive" },
          { label: "EPIs a trocar", value: kpis.epiAlerta, icon: HardHat, tone: "text-amber-600" },
          { label: "Treinamentos a renovar", value: kpis.treinoAlerta, icon: AlertTriangle, tone: "text-amber-600" },
          { label: "Treinamentos obrigatórios", value: kpis.obrigatorios, icon: GraduationCap, tone: "text-primary" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
            <k.icon className={`size-5 ${k.tone}`} />
            <p className="mt-2 text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Colaborador</Label>
          <Select value={colabFilter} onValueChange={setColabFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="todos">Todos</SelectItem>
              {colabList.map((x) => (
                <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {c.isError && <DpErrorState onRetry={c.refetchAll} className="mb-3" />}

      <Tabs defaultValue="aso">
        <TabsList className="flex w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="aso" className="flex-1 sm:flex-none">Exames (ASO)</TabsTrigger>
          <TabsTrigger value="epis" className="flex-1 sm:flex-none">EPIs</TabsTrigger>
          <TabsTrigger value="treinamentos" className="flex-1 sm:flex-none">Treinamentos</TabsTrigger>
        </TabsList>

        {/* ---------------------------- ASO ---------------------------- */}
        <TabsContent value="aso" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button className="rounded-full px-6" onClick={() => { setExameEdit(null); setExameOpen(true); }}>
              <Plus className="mr-2 size-4" /> Novo exame
            </Button>
          </div>
          <DpContentCard>
            {c.examesLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando…</div>
            ) : c.exames.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum exame registrado.</div>
            ) : (
              <div className="divide-y divide-border">
                {c.exames.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.colaborador_nome ?? "Colaborador"}</p>
                      <p className="text-sm text-muted-foreground">
                        {EXAME_TIPO_LABEL[e.tipo]} · realizado {fmt(e.data_realizado)} · vence {fmt(e.data_vencimento)}
                        {e.clinica ? ` · ${e.clinica}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{EXAME_RESULTADO_LABEL[e.resultado]}</Badge>
                      <VencimentoBadge data={e.data_vencimento} />
                      <Button size="sm" variant="outline" aria-label="Editar" onClick={() => { setExameEdit(e); setExameOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => c.deleteExame.mutate(e.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>
        </TabsContent>

        {/* ---------------------------- EPIs --------------------------- */}
        <TabsContent value="epis" className="mt-4 space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { setEpiEdit(null); setEpiOpen(true); }}>
              <Plus className="mr-2 size-4" /> Novo EPI
            </Button>
            <Button className="rounded-full px-6" onClick={() => { setEntregaEdit(null); setEntregaOpen(true); }}>
              <Plus className="mr-2 size-4" /> Registrar entrega
            </Button>
          </div>

          <DpContentCard>
            <div className="border-b border-border p-4 text-sm font-bold uppercase text-muted-foreground">
              Catálogo de EPIs
            </div>
            {c.epis.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">Nenhum EPI cadastrado.</div>
            ) : (
              <div className="divide-y divide-border">
                {c.epis.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {e.ca ? `CA ${e.ca}` : "Sem CA"}
                        {e.validade_dias ? ` · troca a cada ${e.validade_dias} dias` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!e.ativo && <Badge variant="outline">Inativo</Badge>}
                      <Button size="sm" variant="outline" aria-label="Editar" onClick={() => { setEpiEdit(e); setEpiOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => c.deleteEpi.mutate(e.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>

          <DpContentCard>
            <div className="border-b border-border p-4 text-sm font-bold uppercase text-muted-foreground">
              Ficha de entrega
            </div>
            {c.entregas.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">Nenhuma entrega registrada.</div>
            ) : (
              <div className="divide-y divide-border">
                {c.entregas.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.colaborador_nome ?? "Colaborador"}</p>
                      <p className="text-sm text-muted-foreground">
                        {e.epi_nome ?? "EPI"} · {e.quantidade} un · entregue {fmt(e.data_entrega)}
                        {e.data_troca_prevista ? ` · troca ${fmt(e.data_troca_prevista)}` : ""}
                        {e.data_devolucao ? ` · devolvido ${fmt(e.data_devolucao)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {e.recebido_em
                        ? <Badge className="bg-emerald-500/15 text-emerald-600">Recebido</Badge>
                        : <Badge variant="outline">Sem confirmação</Badge>}
                      {!e.data_devolucao && <VencimentoBadge data={e.data_troca_prevista} janela={15} />}
                      <Button size="sm" variant="outline" aria-label="Editar" onClick={() => { setEntregaEdit(e); setEntregaOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => c.deleteEntrega.mutate(e.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>
        </TabsContent>

        {/* ------------------------ Treinamentos ----------------------- */}
        <TabsContent value="treinamentos" className="mt-4 space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { setTreinoEdit(null); setTreinoOpen(true); }}>
              <Plus className="mr-2 size-4" /> Novo treinamento
            </Button>
            <Button className="rounded-full px-6" onClick={() => { setPartEdit(null); setPartOpen(true); }}>
              <Plus className="mr-2 size-4" /> Nova participação
            </Button>
          </div>

          <DpContentCard>
            <div className="border-b border-border p-4 text-sm font-bold uppercase text-muted-foreground">
              Catálogo de treinamentos
            </div>
            {c.treinamentos.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">Nenhum treinamento cadastrado.</div>
            ) : (
              <div className="divide-y divide-border">
                {c.treinamentos.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{t.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.carga_horaria ? `${t.carga_horaria}h` : "Sem carga horária"}
                        {t.validade_meses ? ` · validade ${t.validade_meses} meses` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.obrigatorio && <Badge className="bg-primary/15 text-primary">Obrigatório</Badge>}
                      {!t.ativo && <Badge variant="outline">Inativo</Badge>}
                      <Button size="sm" variant="outline" aria-label="Editar" onClick={() => { setTreinoEdit(t); setTreinoOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => c.deleteTreinamento.mutate(t.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DpContentCard>

          <DpContentCard>
            <div className="border-b border-border p-4 text-sm font-bold uppercase text-muted-foreground">
              Participações
            </div>
            {c.participacoes.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">Nenhuma participação registrada.</div>
            ) : (
              <div className="divide-y divide-border">
                {c.participacoes.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.colaborador_nome ?? "Colaborador"}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.treinamento_nome ?? "Treinamento"} · concluído {fmt(p.data_conclusao)}
                        {p.data_vencimento ? ` · vence ${fmt(p.data_vencimento)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{TREINAMENTO_STATUS_LABEL[p.status]}</Badge>
                      <VencimentoBadge data={p.data_vencimento} />
                      <Button size="sm" variant="outline" aria-label="Editar" onClick={() => { setPartEdit(p); setPartOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => c.deleteParticipacao.mutate(p.id)}>
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

      <ExameDialog
        open={exameOpen}
        onOpenChange={setExameOpen}
        colaboradores={colabList}
        editing={exameEdit}
        saving={c.saveExame.isPending}
        onSubmit={(input) => c.saveExame.mutate(input, { onSuccess: () => setExameOpen(false) })}
      />
      <EpiDialog
        open={epiOpen}
        onOpenChange={setEpiOpen}
        editing={epiEdit}
        saving={c.saveEpi.isPending}
        onSubmit={(input) => c.saveEpi.mutate(input, { onSuccess: () => setEpiOpen(false) })}
      />
      <EpiEntregaDialog
        open={entregaOpen}
        onOpenChange={setEntregaOpen}
        colaboradores={colabList}
        epis={c.epis}
        editing={entregaEdit}
        saving={c.saveEntrega.isPending}
        onSubmit={(input) => c.saveEntrega.mutate(input, { onSuccess: () => setEntregaOpen(false) })}
      />
      <TreinamentoDialog
        open={treinoOpen}
        onOpenChange={setTreinoOpen}
        editing={treinoEdit}
        saving={c.saveTreinamento.isPending}
        onSubmit={(input) => c.saveTreinamento.mutate(input, { onSuccess: () => setTreinoOpen(false) })}
      />
      <ParticipacaoDialog
        open={partOpen}
        onOpenChange={setPartOpen}
        colaboradores={colabList}
        treinamentos={c.treinamentos}
        editing={partEdit}
        saving={c.saveParticipacao.isPending}
        onSubmit={(input) => c.saveParticipacao.mutate(input, { onSuccess: () => setPartOpen(false) })}
      />
    </DpPage>
  );
}
