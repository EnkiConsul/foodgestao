import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Handshake,
  HeartPulse,
  Plane,
  RotateCcw,
  Sun,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { useDpOperacaoPanorama, type DiaPanorama } from "@/hooks/useDpOperacaoPanorama";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  blocosPorFuncionamento,
  CATEGORIA_LABEL,
  mensagemAlerta,
  somarDias,
  type CategoriaDia,
  type PessoaPanorama,
} from "@/lib/dp/operacao-panorama";

import { DpPage, DpPageHeader, DpFilterCard, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { DpStatCard } from "@/components/dp/DpStatCard";
import { DpTabsBar } from "@/components/dp/DpTabsBar";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dataExtenso = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

const competenciaExtenso = (c: string) =>
  new Date(`${c}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const somarMeses = (competencia: string, n: number) => {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(ano, mes - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const DOW_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CATEGORIA_ORDEM: CategoriaDia[] = [
  "fixo",
  "convocado_aceito",
  "convocado_pendente",
  "folga_padrao",
  "folga_extra",
  "ferias",
  "atestado",
];

const CATEGORIA_TONE: Record<CategoriaDia, "primary" | "muted" | "success" | "warning" | "danger"> = {
  fixo: "primary",
  convocado_aceito: "success",
  convocado_pendente: "warning",
  folga_padrao: "muted",
  folga_extra: "muted",
  ferias: "primary",
  atestado: "danger",
};

const CATEGORIA_ICON: Record<CategoriaDia, typeof Users> = {
  fixo: Users,
  convocado_aceito: UserCheck,
  convocado_pendente: Clock,
  folga_padrao: Sun,
  folga_extra: Sun,
  ferias: Plane,
  atestado: HeartPulse,
};

type CardKey = CategoriaDia | "folga_socio";

const CARDS_DIA: CardKey[] = [...CATEGORIA_ORDEM, "folga_socio"];
const CARDS_MES = ["dias_mes", "media_pessoas", "dias_fora_padrao", "dias_sem_ninguem"] as const;
type CardMesKey = (typeof CARDS_MES)[number];

const PREFS_KEY = "operacao_cards";
const UNIDADE_KEY = "operacao_unidade";

/** Card arrastável: o conteúdo é o DpStatCard normal com um handle discreto. */
function CardArrastavel({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      {children}
      <button
        type="button"
        aria-label="Reordenar card"
        className="absolute right-1 top-1 rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function GradeCards({
  ordem,
  onReordenar,
  render,
}: {
  ordem: string[];
  onReordenar: (next: string[]) => void;
  render: (key: string) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ordem.indexOf(String(active.id));
    const to = ordem.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReordenar(arrayMove(ordem, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ordem} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ordem.map((k) => (
            <CardArrastavel key={k} id={k}>
              {render(k)}
            </CardArrastavel>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Secao({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DpContentCard contentClassName="p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </DpContentCard>
  );
}

function SituacaoBadge({ dia }: { dia: DiaPanorama }) {
  if (dia.dispensado) return <Badge variant="outline">Alerta resolvido</Badge>;
  if (dia.avaliacao.situacao === "abaixo")
    return <Badge variant="destructive">Abaixo do padrão ({dia.avaliacao.diferenca})</Badge>;
  if (dia.avaliacao.situacao === "acima")
    return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
      Acima do padrão (+{dia.avaliacao.diferenca})
    </Badge>;
  if (dia.avaliacao.situacao === "ok") return <Badge variant="secondary">Dentro do padrão</Badge>;
  return null;
}

export default function DpOperacaoPanorama() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(() => params.get("data") || hojeIso());
  const [unidade, setUnidade] = useState<string>("");
  const [aba, setAba] = useState(params.get("aba") === "mes" ? "mes" : "dia");
  const [detalheCategoria, setDetalheCategoria] = useState<CategoriaDia | null>(null);
  const [verSocios, setVerSocios] = useState(false);

  const { prefs, save } = useDpUserPrefs();
  const unidadeId = !unidade || unidade === "todas" ? null : unidade;
  const competencia = data.slice(0, 7);
  const panorama = useDpOperacaoPanorama(competencia, unidadeId);

  /** Abre já em uma unidade: a última escolhida ou a de maior quadro. */
  useEffect(() => {
    if (unidade || !panorama.unidades.length) return;
    const salva = (prefs.extras as Record<string, unknown>)?.[UNIDADE_KEY];
    if (typeof salva === "string" && (salva === "todas" || panorama.unidades.some((u) => u.id === salva))) {
      setUnidade(salva);
      return;
    }
    const maior = [...panorama.unidades].sort(
      (a, b) => (panorama.contagemPorUnidade.get(b.id) ?? 0) - (panorama.contagemPorUnidade.get(a.id) ?? 0),
    )[0];
    setUnidade(maior?.id ?? "todas");
  }, [unidade, panorama.unidades, panorama.contagemPorUnidade, prefs.extras]);

  const trocarUnidade = (v: string) => {
    setUnidade(v);
    save({ extras: { ...(prefs.extras ?? {}), [UNIDADE_KEY]: v } });
  };

  // Ordem dos cards por aba, salva nas preferências do usuário.
  const ordemSalva = (prefs.extras as Record<string, unknown>)?.[PREFS_KEY] as
    | Record<string, string[]>
    | undefined;

  const ordenar = (padrao: readonly string[], salvo?: string[]) => {
    const validos = (salvo ?? []).filter((k) => padrao.includes(k));
    return [...validos, ...padrao.filter((k) => !validos.includes(k))];
  };

  const ordemDia = useMemo(() => ordenar(CARDS_DIA, ordemSalva?.dia), [ordemSalva?.dia]);
  const ordemMes = useMemo(() => ordenar(CARDS_MES, ordemSalva?.mes), [ordemSalva?.mes]);

  const salvarOrdem = (chave: "dia" | "mes", next: string[]) =>
    save({
      extras: { ...(prefs.extras ?? {}), [PREFS_KEY]: { ...(ordemSalva ?? {}), [chave]: next } },
    });

  const dia = panorama.diaDe(data);
  const nomeUnidade = unidadeId ? panorama.unidades.find((u) => u.id === unidadeId)?.nome ?? null : null;

  const trocarAba = (v: string) => {
    setAba(v);
    const next = new URLSearchParams(params);
    next.set("aba", v);
    setParams(next, { replace: true });
  };

  const irParaDia = (iso: string) => {
    setData(iso);
    trocarAba("dia");
  };

  /** Blocos do dia pelos períodos de funcionamento da loja, agrupados por cargo. */
  const blocos = useMemo(() => {
    if (!dia) return [];
    const trabalhando = dia.pessoas.filter(
      (p) => p.categoria === "fixo" || p.categoria === "convocado_aceito" || p.categoria === "convocado_pendente",
    );
    return blocosPorFuncionamento({
      data,
      pessoas: trabalhando,
      funcionamentoPorUnidade: panorama.funcionamentoPorUnidade,
      unidades: panorama.unidades,
      unidadeId,
    });
  }, [dia, data, unidadeId, panorama.funcionamentoPorUnidade, panorama.unidades]);

  /** Sócios em folga ou férias no dia — substitui o antigo card de carga. */
  const sociosAusentes = useMemo(
    () =>
      (dia?.pessoas ?? []).filter(
        (p) => p.socio && ["folga_padrao", "folga_extra", "ferias"].includes(p.categoria),
      ),
    [dia],
  );

  const diasComSocioAusente = useMemo(
    () =>
      new Set(
        panorama.dias
          .filter((d) =>
            d.pessoas.some((p) => p.socio && ["folga_padrao", "folga_extra", "ferias"].includes(p.categoria)),
          )
          .map((d) => d.data),
      ),
    [panorama.dias],
  );


  const diasAlerta = useMemo(() => panorama.dias.filter((d) => d.alerta), [panorama.dias]);

  const dispensar = (d: DiaPanorama) =>
    panorama.dispensarAlerta.mutate(
      { data: d.data, previsto: d.trabalhando, padrao: d.avaliacao.padrao ?? 0 },
      {
        onSuccess: () => toast.success("Alerta marcado como resolvido."),
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível dispensar o alerta."),
      },
    );

  const reativar = (d: DiaPanorama) =>
    panorama.reativarAlerta.mutate(d.data, {
      onSuccess: () => toast.success("Alerta reativado."),
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível reativar o alerta."),
    });

  if (panorama.error) return <DpErrorState message="Não foi possível carregar a operação." />;

  // Sócios ausentes seguem visíveis nas listas (com a tag "Folga sócio"),
  // mesmo não somando nos números dos cards de folga/férias.
  const pessoasDaCategoria = detalheCategoria
    ? (dia?.pessoas ?? []).filter((p) => p.categoria === detalheCategoria)
    : [];

  /** Sócio ausente sem obrigação CLT: exibido com tag própria. */
  const tagSocio = (p: PessoaPanorama) =>
    p.socio && ["folga_padrao", "folga_extra", "ferias"].includes(p.categoria) && !p.socio_integrado;


  return (
    <DpPage>
      <Helmet>
        <title>Operação | Pessoas 360°FOOD</title>
        <meta
          name="description"
          content="Acompanhe quantos colaboradores fixos, intermitentes convocados, folgas, férias e atestados a operação tem em cada dia."
        />
      </Helmet>

      <DpPageHeader
        title="Operação"
        description="Quantas pessoas a operação tem em cada dia — sem precisar gerar escala."
        icon={CalendarClock}
      />

      <DpFilterCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data-panorama">{aba === "mes" ? "Competência" : "Dia"}</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Anterior"
                onClick={() =>
                  setData(aba === "mes" ? `${somarMeses(competencia, -1)}-01` : somarDias(data, -1))
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {aba === "mes" ? (
                <Input
                  id="data-panorama"
                  type="month"
                  value={competencia}
                  onChange={(e) => setData(`${e.target.value || hojeIso().slice(0, 7)}-01`)}
                />
              ) : (
                <Input
                  id="data-panorama"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value || hojeIso())}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label="Próximo"
                onClick={() =>
                  setData(aba === "mes" ? `${somarMeses(competencia, 1)}-01` : somarDias(data, 1))
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidade || "todas"} onValueChange={trocarUnidade}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as unidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {panorama.unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setData(hojeIso())}>
            Hoje
          </Button>
          <span className="text-sm text-muted-foreground first-letter:uppercase">
            {aba === "mes" ? competenciaExtenso(competencia) : dataExtenso(data)}
          </span>
          {dia && <SituacaoBadge dia={dia} />}
        </div>
      </DpFilterCard>

      <Tabs value={aba} onValueChange={trocarAba} className="space-y-4">
        <DpTabsBar>
          <TabsTrigger value="dia">Rotina do Dia</TabsTrigger>
          <TabsTrigger value="mes">Rotina do Mês</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="dia" className="space-y-4">
          {panorama.isLoading || !dia ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <GradeCards
                ordem={ordemDia}
                onReordenar={(next) => salvarOrdem("dia", next)}
                render={(k) => {
                  if (k === "folga_socio") {
                    return (
                      <DpStatCard
                        icon={Handshake}
                        tone={sociosAusentes.length ? "warning" : "muted"}
                        label="Folga Sócio"
                        value={sociosAusentes.length}
                        onClick={sociosAusentes.length ? () => setVerSocios(true) : undefined}
                      />
                    );
                  }
                  const cat = k as CategoriaDia;
                  return (
                    <DpStatCard
                      icon={CATEGORIA_ICON[cat]}
                      tone={CATEGORIA_TONE[cat]}
                      label={CATEGORIA_LABEL[cat]}
                      value={dia.contagens[cat]}
                      onClick={dia.contagens[cat] > 0 ? () => setDetalheCategoria(cat) : undefined}
                    />
                  );
                }}
              />

              {dia.avaliacao.situacao !== "sem_padrao" && dia.avaliacao.situacao !== "ok" && (
                <Secao
                  title="Fora do Padrão"
                  description={mensagemAlerta(dia, dia.avaliacao, nomeUnidade)}
                  action={
                    dia.dispensado ? (
                      <Button variant="ghost" size="sm" onClick={() => reativar(dia)}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        Reativar alerta
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => dispensar(dia)}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Está ok
                      </Button>
                    )
                  }
                >
                  <p className="text-sm text-muted-foreground">
                    O padrão vem da mediana das últimas 8 semanas para este dia da semana
                    {unidadeId ? " nesta unidade" : ""}.
                  </p>
                </Secao>
              )}

              {blocos.length ? (
                blocos.map((bloco) => (
                  <Secao
                    key={bloco.key}
                    title={bloco.titulo}
                    description={[
                      bloco.horario,
                      !unidadeId && bloco.unidade_nome ? bloco.unidade_nome : null,
                      `${bloco.pessoas.length} pessoa(s)`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    action={
                      bloco.fechado ? <Badge variant="outline">Fora do funcionamento</Badge> : undefined
                    }
                  >
                    {bloco.pessoas.length ? (
                      <div className="space-y-3">
                        {bloco.grupos.map((g) => (
                          <div key={g.cargo_id ?? "sem-cargo"}>
                            <p className="mb-1 text-xs font-semibold text-muted-foreground">
                              {g.cargo_nome} ({g.pessoas.length})
                            </p>
                            <ul className="divide-y">
                              {g.pessoas.map((p) => (
                                <li
                                  key={p.colaborador_id}
                                  className="flex items-center justify-between gap-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{p.nome}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {p.entrada ?? "--:--"} às {p.saida ?? "--:--"}
                                      {p.termina_no_dia_seguinte ? " (+1)" : ""} ·{" "}
                                      {formatarHoras(p.carga_prevista_horas)}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {p.socio && (
                                      <Badge variant="outline" className="border-primary/40 text-primary">Sócio</Badge>
                                    )}
                                    <Badge variant={p.categoria === "convocado_pendente" ? "outline" : "secondary"}>
                                      {CATEGORIA_LABEL[p.categoria]}
                                    </Badge>
                                  </div>

                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {bloco.fechado
                          ? "A unidade está fechada neste dia e ninguém está previsto."
                          : "Ninguém previsto neste período."}
                      </p>
                    )}
                  </Secao>
                ))
              ) : (
                <Secao title="Ninguém na Operação Neste Dia">
                  <p className="text-sm text-muted-foreground">
                    Nenhum fixo com jornada prevista e nenhuma convocação para {dataExtenso(data)}.
                  </p>
                </Secao>
              )}

              {dia.pessoas.some((p) =>
                ["folga_padrao", "folga_extra", "ferias", "atestado"].includes(p.categoria),
              ) && (
                <Secao title="Fora da Operação" description="Folgas, férias e afastamentos do dia">
                  <ul className="divide-y">
                    {dia.pessoas
                      .filter((p) =>
                        ["folga_padrao", "folga_extra", "ferias", "atestado"].includes(p.categoria),
                      )
                      .map((p) => (
                        <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                          <span className="truncate text-sm">{p.nome}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {tagSocio(p) && (
                              <Badge variant="outline" className="border-primary/40 text-primary">Folga sócio</Badge>
                            )}
                            <Badge variant="outline">{CATEGORIA_LABEL[p.categoria]}</Badge>
                          </div>
                        </li>
                      ))}
                  </ul>
                </Secao>
              )}

            </>
          )}
        </TabsContent>

        <TabsContent value="mes" className="space-y-4">
          {panorama.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <GradeCards
                ordem={ordemMes}
                onReordenar={(next) => salvarOrdem("mes", next)}
                render={(k) => {
                  if (k === "dias_mes")
                    return (
                      <DpStatCard
                        icon={CalendarDays}
                        label="Dias no Mês"
                        value={panorama.dias.length}
                        hint={competenciaExtenso(competencia)}
                      />
                    );
                  if (k === "media_pessoas")
                    return (
                      <DpStatCard
                        icon={Users}
                        label="Média de Pessoas por Dia"
                        value={
                          panorama.dias.length
                            ? Math.round(
                                panorama.dias.reduce((a, d) => a + d.trabalhando, 0) / panorama.dias.length,
                              )
                            : 0
                        }
                      />
                    );
                  if (k === "dias_fora_padrao")
                    return (
                      <DpStatCard
                        icon={AlertTriangle}
                        tone={diasAlerta.length ? "warning" : "muted"}
                        label="Dias Fora do Padrão"
                        value={diasAlerta.length}
                        hint="Sem alertas resolvidos"
                      />
                    );
                  return (
                    <DpStatCard
                      icon={UserX}
                      tone="muted"
                      label="Dias Sem Ninguém"
                      value={panorama.dias.filter((d) => d.trabalhando === 0).length}
                    />
                  );
                }}
              />

              <Secao
                title="Calendário da Operação"
                description="Clique em um dia para ver o detalhamento por turno."
              >
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                  {DOW_CURTO.map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: panorama.dias[0]?.dow ?? 0 }).map((_, i) => (
                    <div key={`vazio-${i}`} />
                  ))}
                  {panorama.dias.map((d) => (
                    <button
                      key={d.data}
                      type="button"
                      onClick={() => irParaDia(d.data)}
                      className={`rounded-md border p-1.5 text-left transition-colors hover:bg-muted/50 ${
                        d.alerta
                          ? d.avaliacao.situacao === "abaixo"
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-amber-500/50 bg-amber-500/5"
                          : "border-border"
                      } ${d.data === data ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{Number(d.data.slice(-2))}</span>
                        {d.dispensado && <Check className="h-3 w-3 text-muted-foreground" />}
                        {d.alerta && <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
                        {diasComSocioAusente.has(d.data) && (
                          <span
                            aria-label="Sócio em folga ou férias"
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                          />
                        )}
                      </div>
                      <p className="text-[11px] font-medium">{d.trabalhando} confirmado(s)</p>
                      {d.aguardando > 0 && (
                        <p className="text-[10px] leading-tight text-amber-600">
                          {d.aguardando} aguardando
                        </p>
                      )}
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        {d.contagens.fixo}F · {d.contagens.convocado_aceito}I ·{" "}
                        {d.contagens.folga_padrao + d.contagens.folga_extra}FG
                      </p>
                      {d.avaliacao.padrao != null && (
                        <p className="text-[10px] text-muted-foreground">padrão {d.avaliacao.padrao}</p>
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  F = fixos escalados · I = intermitentes convocados · FG = folgas · ponto âmbar = sócio
                  em folga/férias
                </p>
              </Secao>

              <Secao
                title="Dias Para Avaliar"
                description={
                  diasAlerta.length
                    ? `${diasAlerta.length} dia(s) fora do padrão histórico`
                    : "Nenhum dia fora do padrão neste mês."
                }
              >
                <ul className="divide-y">
                  {diasAlerta.map((d) => (
                    <li key={d.data} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="text-sm font-medium underline-offset-2 hover:underline"
                          onClick={() => irParaDia(d.data)}
                        >
                          <span className="first-letter:uppercase">{dataExtenso(d.data)}</span>
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {mensagemAlerta(d, d.avaliacao, nomeUnidade)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => dispensar(d)}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Está ok
                      </Button>
                    </li>
                  ))}
                  {!diasAlerta.length && (
                    <li className="py-2 text-sm text-muted-foreground">
                      A operação está dentro do padrão aprendido pelo sistema.
                    </li>
                  )}
                </ul>
              </Secao>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={verSocios} onOpenChange={setVerSocios}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Folga Sócio</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(data)}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {sociosAusentes.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm">{p.nome}</span>
                <Badge variant="outline">{p.categoria === "ferias" ? "Férias" : "Folga"}</Badge>
              </li>
            ))}
            {!sociosAusentes.length && (
              <li className="py-2 text-sm text-muted-foreground">Nenhum sócio ausente neste dia.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalheCategoria} onOpenChange={(o) => !o && setDetalheCategoria(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detalheCategoria ? CATEGORIA_LABEL[detalheCategoria] : ""}</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(data)}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {pessoasDaCategoria.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm">{p.nome}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {tagSocio(p) && (
                    <Badge variant="outline" className="border-primary/40 text-primary">Folga sócio</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {p.entrada ? `${p.entrada} às ${p.saida ?? "--:--"}` : "—"}
                  </span>
                </div>
              </li>
            ))}

          </ul>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
