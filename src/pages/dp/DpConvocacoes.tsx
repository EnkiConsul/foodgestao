import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  BellRing, CalendarClock, CheckCircle2, Clock, History, Pencil, Plus, Settings2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpPage, DpPageHeader, DpContentCard, DpEmptyState } from "@/components/dp/DpPage";
import { NovaConvocacaoWizard } from "@/components/dp/convocacoes/NovaConvocacaoWizard";
import { ConvocacoesRegrasPanel } from "@/components/dp/convocacoes/ConvocacoesRegrasPanel";
import { useDpConvocacaoGrupos, type GrupoComOcorrencias } from "@/hooks/useDpConvocacaoGrupos";
import { useDpConvocacoes } from "@/hooks/useDpConvocacoes";
import { statusEfetivo, STATUS_META } from "@/lib/dp/convocacoes";
import { antecedenciaDias } from "@/lib/dp/convocacoes-planejamento";
import { cn } from "@/lib/utils";

const hoje = () => new Date().toISOString().slice(0, 10);
const emDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

interface ContagemGrupo {
  pendentes: number;
  aceitas: number;
}

function GrupoCard({
  grupo,
  contagem,
  onEditar,
}: {
  grupo: GrupoComOcorrencias;
  contagem?: ContagemGrupo;
  onEditar?: (g: GrupoComOcorrencias) => void;
}) {
  const total = grupo.ocorrencias.length;
  const vagas = grupo.ocorrencias.reduce((s, o) => s + (o.vagas ?? 0), 0);
  const foraPrazo = grupo.ocorrencias.filter((o) => o.fora_antecedencia).length;
  const cargos = new Set(grupo.ocorrencias.map((o) => o.cargo_id).filter(Boolean)).size;

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            {grupo.titulo?.trim() || `Convocação ${grupo.competencia}`}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {grupo.unidade_nome ?? "Unidade"} · {grupo.competencia} ·{" "}
            {grupo.modalidade === "individual" ? "Individual" : "Aberta"} ·{" "}
            {cargos} cargo(s)
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={grupo.status === "rascunho" ? "outline" : "default"} className="text-[10px]">
            {grupo.status === "rascunho" ? "Rascunho" : grupo.status}
          </Badge>
          {contagem?.aceitas ? (
            <Badge variant="outline" className="text-[10px]">
              {contagem.aceitas} confirmada(s)
            </Badge>
          ) : null}
          {contagem?.pendentes ? (
            <Badge variant="outline" className="text-[10px]">
              {contagem.pendentes} aguardando
            </Badge>
          ) : null}
          {foraPrazo > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {foraPrazo} fora da antecedência
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {grupo.ocorrencias.slice(0, 12).map((o) => (
          <span
            key={o.id}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px]",
              antecedenciaDias(o.data) < 0
                ? "border-border text-muted-foreground"
                : "border-primary/30 bg-primary/5 text-primary",
            )}
            title={`${o.necessidade_entrada} - ${o.necessidade_saida} · ${o.vagas} vaga(s)`}
          >
            {rotuloData(o.data)}
          </span>
        ))}
        {total > 12 && (
          <span className="px-1 text-[11px] text-muted-foreground">+{total - 12}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {total} data(s) · {vagas} vaga(s) previstas
        </span>
        {grupo.status === "rascunho" && onEditar && (
          <Button size="sm" variant="outline" onClick={() => onEditar(grupo)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Continuar edição
          </Button>
        )}
      </div>
    </div>
  );
}

export default function DpConvocacoes() {
  const [wizard, setWizard] = useState(false);
  const [emEdicao, setEmEdicao] = useState<GrupoComOcorrencias | null>(null);
  const grupos = useDpConvocacaoGrupos();
  const legado = useDpConvocacoes(emDias(-180), emDias(180));

  // Registros do fluxo antigo (sem ocorrência) continuam visíveis, marcados.
  const legadas = useMemo(
    () => (legado.rows ?? []).filter((r: any) => !r.ocorrencia_id),
    [legado.rows],
  );

  /** Contagem real por grupo: pendente e aceita nunca se somam. */
  const contagemPorGrupo = useMemo(() => {
    const ocorrenciaParaGrupo = new Map<string, string>();
    for (const g of grupos.data ?? []) {
      for (const o of g.ocorrencias) ocorrenciaParaGrupo.set(o.id, g.id);
    }
    const m = new Map<string, ContagemGrupo>();
    for (const r of (legado.rows ?? []) as any[]) {
      const grupoId = r.ocorrencia_id ? ocorrenciaParaGrupo.get(r.ocorrencia_id) : null;
      if (!grupoId) continue;
      const atual = m.get(grupoId) ?? { pendentes: 0, aceitas: 0 };
      if (r.status === "aceita") atual.aceitas += 1;
      else if (r.status === "pendente") atual.pendentes += 1;
      m.set(grupoId, atual);
    }
    return m;
  }, [grupos.data, legado.rows]);

  const buckets = useMemo(() => {
    const hj = hoje();
    const lista = grupos.data ?? [];
    const datas = (g: GrupoComOcorrencias) => g.ocorrencias.map((o) => o.data);
    return {
      proximas: lista.filter((g) => datas(g).some((d) => d >= hj)),
      aguardando: lista.filter((g) => (contagemPorGrupo.get(g.id)?.pendentes ?? 0) > 0),
      confirmadas: lista.filter((g) => (contagemPorGrupo.get(g.id)?.aceitas ?? 0) > 0),
      realizadas: lista.filter(
        (g) => datas(g).length > 0 && datas(g).every((d) => d < hj),
      ),
    };
  }, [grupos.data, contagemPorGrupo]);

  const abrirEdicao = (g: GrupoComOcorrencias) => {
    setEmEdicao(g);
    setWizard(true);
  };

  const listaOuVazio = (
    lista: GrupoComOcorrencias[],
    icone: any,
    titulo: string,
    texto: string,
  ) =>
    grupos.isLoading ? (
      <p className="text-sm text-muted-foreground">Carregando…</p>
    ) : lista.length === 0 ? (
      <DpEmptyState icon={icone} dashed>
        <div className="space-y-1">
          <p className="font-medium text-foreground">{titulo}</p>
          <p>{texto}</p>
        </div>
      </DpEmptyState>
    ) : (
      <div className="space-y-2">
        {lista.map((g) => (
          <GrupoCard
            key={g.id}
            grupo={g}
            contagem={contagemPorGrupo.get(g.id)}
            onEditar={abrirEdicao}
          />
        ))}
      </div>
    );

  return (
    <DpPage>
      <Helmet>
        <title>Convocações | Pessoas 360°</title>
        <meta
          name="description"
          content="Planeje convocações de intermitentes e freelancers por unidade, data e cargo, com regras de antecedência."
        />
      </Helmet>

      <DpPageHeader
        icon={BellRing}
        title="Convocações"
        description="Planejamento de convocações de intermitentes e freelancers."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEmEdicao(null);
              setWizard(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nova convocação
          </Button>
        }
      />

      <Tabs defaultValue="proximas">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="proximas" className="gap-1.5">
            <CalendarClock className="h-4 w-4" /> Próximas
          </TabsTrigger>
          <TabsTrigger value="aguardando" className="gap-1.5">
            <Clock className="h-4 w-4" /> Aguardando
          </TabsTrigger>
          <TabsTrigger value="confirmadas" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Confirmadas
          </TabsTrigger>
          <TabsTrigger value="realizadas" className="gap-1.5">
            <Users className="h-4 w-4" /> Realizadas
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <History className="h-4 w-4" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="regras" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Regras
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proximas" className="mt-3 space-y-3">
          <DpContentCard>
            {listaOuVazio(
              buckets.proximas,
              CalendarClock,
              "Nada nas próximas datas",
              "Crie uma convocação para planejar datas, vagas e público. Rascunhos ficam aqui até a publicação.",
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="aguardando" className="mt-3">
          <DpContentCard>
            {listaOuVazio(
              buckets.aguardando,
              Clock,
              "Ninguém aguardando resposta",
              "Aparecem aqui as convocações já enviadas cujo aceite ainda não chegou. Pendentes nunca contam como confirmados.",
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="confirmadas" className="mt-3">
          <DpContentCard>
            {listaOuVazio(
              buckets.confirmadas,
              CheckCircle2,
              "Nenhuma confirmação ainda",
              "Cada aceite registrado pela pessoa aparece nesta aba.",
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="realizadas" className="mt-3">
          <DpContentCard>
            {listaOuVazio(
              buckets.realizadas,
              Users,
              "Nada realizado no período",
              "Convocações cujas datas já passaram ficam nesta aba.",
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="historico" className="mt-3">
          <DpContentCard>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Fluxo anterior</Badge>
              <span className="text-[11px] text-muted-foreground">
                Convocações criadas no formato antigo — somente leitura.
              </span>
            </div>
            {legado.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : legadas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro do fluxo anterior.</p>
            ) : (
              <div className="space-y-1.5">
                {legadas.map((c: any) => {
                  const st = statusEfetivo(c);
                  const meta = (STATUS_META as any)[st];
                  return (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <span className="font-medium">
                        {rotuloData(c.data)} · {c.dp_colaboradores?.nome ?? "—"}
                      </span>
                      <span className="text-muted-foreground">
                        {c.entrada?.slice(0, 5)}–{c.saida?.slice(0, 5)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {meta?.label ?? st}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </DpContentCard>
        </TabsContent>

        <TabsContent value="regras" className="mt-3">
          <ConvocacoesRegrasPanel />
        </TabsContent>
      </Tabs>

      <NovaConvocacaoWizard
        open={wizard}
        onOpenChange={(v) => {
          setWizard(v);
          if (!v) setEmEdicao(null);
        }}
        grupo={emEdicao}
      />
    </DpPage>
  );
}

