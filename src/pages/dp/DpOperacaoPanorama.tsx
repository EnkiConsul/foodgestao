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
  Plus,
  RotateCcw,
  Sun,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useDpOperacaoPanorama, type DiaPanorama } from "@/hooks/useDpOperacaoPanorama";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { DpRegistrarAusenciaDialog } from "@/components/dp/DpRegistrarAusenciaDialog";
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
  type PessoaAvulsaPanorama,
  type PessoaPanorama,
} from "@/lib/dp/operacao-panorama";
import { DpPessoaAvulsaDialog } from "@/components/dp/DpPessoaAvulsaDialog";
import type { PessoaAvulsaInput } from "@/hooks/useDpOperacaoPanorama";

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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const AVULSO_LABEL: Record<"avulso_teste" | "avulso_folguista", string> = {
  avulso_teste: "Em Teste",
  avulso_folguista: "Folguista",
};

const AVULSO_TONE: Record<"avulso_teste" | "avulso_folguista", "primary" | "muted" | "success" | "warning" | "danger"> = {
  avulso_teste: "primary",
  avulso_folguista: "warning",
};

const AVULSO_ICON: Record<"avulso_teste" | "avulso_folguista", typeof Users> = {
  avulso_teste: UserPlus,
  avulso_folguista: UserCog,
};

type CardKey = CategoriaDia | "folga_socio" | "avulso_teste" | "avulso_folguista";

const CARDS_DIA: CardKey[] = [...CATEGORIA_ORDEM, "folga_socio", "avulso_teste", "avulso_folguista"];
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
      className={`relative h-full ${isDragging ? "z-10 opacity-80" : ""}`}
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
        <div className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
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

interface DetalheDiaProps {
  data: string;
  dia: DiaPanorama;
  blocos: ReturnType<typeof blocosPorFuncionamento>;
  sociosAusentes: PessoaPanorama[];
  ausenciasRegistradas: { colaborador_id: string; tipo: string; inicio: string; fim: string; motivo: string | null }[];
  nomesColaboradores: Map<string, string>;
  unidadeId: string | null;
  nomeUnidade: string | null;
  ordemCards: string[];
  onReordenarCards: (next: string[]) => void;
  onVerCategoria: (cat: CategoriaDia) => void;
  onVerSocios: () => void;
  onVerAvulso: (tipo: "avulso_teste" | "avulso_folguista") => void;
  onDispensar: (d: DiaPanorama) => void;
  onReativar: (d: DiaPanorama) => void;
  /** Pessoas avulsas (teste/folguista) que cobrem este dia. */
  avulsos: PessoaAvulsaPanorama[];
  podeRegistrar: boolean;
  onNovaAvulsa: (data: string) => void;
  onEditarAvulsa: (registro: PessoaAvulsaPanorama) => void;
  onExcluirAvulsa: (registro: PessoaAvulsaPanorama) => void;
}

/** Sócio ausente sem obrigação CLT: exibido com tag própria. */
const tagSocio = (p: PessoaPanorama) =>
  p.socio && ["folga_padrao", "folga_extra", "ferias"].includes(p.categoria) && !p.socio_integrado;

/**
 * Detalhamento de um dia da operação. Usado tanto na aba "Rotina do Dia"
 * quanto na janela que abre ao clicar num dia do calendário do mês.
 */
function DetalheDiaOperacao({
  data,
  dia,
  blocos,
  sociosAusentes,
  ausenciasRegistradas,
  nomesColaboradores,
  unidadeId,
  nomeUnidade,
  ordemCards,
  onReordenarCards,
  onVerCategoria,
  onVerSocios,
  onVerAvulso,
  onDispensar,
  onReativar,
  avulsos,
  podeRegistrar,
  onNovaAvulsa,
  onEditarAvulsa,
  onExcluirAvulsa,
}: DetalheDiaProps) {
  const foraDaOperacao = dia.pessoas.filter((p) =>
    ["folga_padrao", "folga_extra", "ferias", "atestado"].includes(p.categoria),
  );
  const ausReg = ausenciasRegistradas.filter((a) => a.inicio <= data && a.fim >= data);
  const rotuloAus = (t: string) => (t === "adiantamento" ? "Adiantamento" : t === "outros" ? "Ausência" : t);
  const avulsosDoDia = avulsos.filter((a) => a.data_inicio <= data && a.data_fim >= data);

  return (
    <div className="space-y-4">
      <GradeCards
        ordem={ordemCards}
        onReordenar={onReordenarCards}
        render={(k) => {
          if (k === "folga_socio") {
            return (
              <DpStatCard
                icon={Handshake}
                tone={sociosAusentes.length ? "warning" : "muted"}
                label="Folga Sócio"
                value={sociosAusentes.length}
                onClick={sociosAusentes.length ? onVerSocios : undefined}
              />
            );
          }
          if (k === "avulso_teste" || k === "avulso_folguista") {
            const value = dia.contagens_avulsos[k === "avulso_teste" ? "teste" : "folguista"];
            return (
              <DpStatCard
                icon={AVULSO_ICON[k]}
                tone={AVULSO_TONE[k]}
                label={AVULSO_LABEL[k]}
                value={value}
                onClick={value > 0 ? () => onVerAvulso(k) : undefined}
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
              onClick={dia.contagens[cat] > 0 ? () => onVerCategoria(cat) : undefined}
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
              <Button variant="ghost" size="sm" onClick={() => onReativar(dia)}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reativar alerta
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onDispensar(dia)}>
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
            action={bloco.fechado ? <Badge variant="outline">Fora do funcionamento</Badge> : undefined}
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
                        <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
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
                              <Badge variant="outline" className="border-primary/40 text-primary">
                                Sócio
                              </Badge>
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

      <Secao
        title="Pessoas Registradas no Dia"
        description="Quem trabalhou no dia por registro manual, em teste ou como folguista"
        action={
          podeRegistrar ? (
            <Button variant="outline" size="sm" onClick={() => onNovaAvulsa(data)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Adicionar Pessoa
            </Button>
          ) : undefined
        }
      >
        {avulsosDoDia.length ? (
          <ul className="divide-y">
            {avulsosDoDia.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.nome ??
                      (a.colaborador_id ? nomesColaboradores.get(a.colaborador_id) ?? "Colaborador" : "Sem nome")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      a.cargo_nome,
                      `${a.entrada ?? "--:--"} às ${a.saida ?? "--:--"}${a.termina_no_dia_seguinte ? " (+1)" : ""}`,
                      a.cobre_nome ? `cobrindo ${a.cobre_nome}` : null,
                      a.data_fim !== a.data_inicio ? `até ${a.data_fim}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {a.observacao && <p className="text-xs text-muted-foreground">{a.observacao}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="secondary">
                    {a.tipo === "teste"
                      ? "Em teste"
                      : a.tipo === "folguista"
                        ? "Folguista"
                        : "Registro manual"}
                  </Badge>
                  {podeRegistrar && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => onEditarAvulsa(a)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onExcluirAvulsa(a)}>
                        Remover
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ninguém registrado manualmente neste dia.
          </p>
        )}
      </Secao>




      {foraDaOperacao.length > 0 && (
        <Secao title="Fora da Operação" description="Folgas, férias e afastamentos do dia">
          <ul className="divide-y">
            {foraDaOperacao.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm">{p.nome}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {tagSocio(p) && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      Folga sócio
                    </Badge>
                  )}
                  <Badge variant="outline">{CATEGORIA_LABEL[p.categoria]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {ausReg.length > 0 && (
        <Secao
          title="Ausências Registradas"
          description="Afastamentos registrados pelo gestor que cobrem este dia"
        >
          <ul className="divide-y">
            {ausReg.map((a, i) => (
              <li key={`${a.colaborador_id}-${i}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="block truncate text-sm">
                    {nomesColaboradores.get(a.colaborador_id) ?? "—"}
                  </span>
                  {a.motivo && <span className="block text-xs text-muted-foreground">{a.motivo}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline">{rotuloAus(a.tipo)}</Badge>
                  {a.fim !== a.inicio && <span className="text-xs text-muted-foreground">até {a.fim}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  );
}

export default function DpOperacaoPanorama() {

  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(() => params.get("data") || hojeIso());
  const [unidade, setUnidade] = useState<string>("");
  const [aba, setAba] = useState(params.get("aba") === "mes" ? "mes" : "dia");
  const [detalheCategoria, setDetalheCategoria] = useState<CategoriaDia | null>(null);
  const [detalheAvulso, setDetalheAvulso] = useState<"avulso_teste" | "avulso_folguista" | null>(null);
  /** Dia aberto em janela a partir do calendário do mês. */
  const [dataPopout, setDataPopout] = useState<string | null>(null);

  const [verSocios, setVerSocios] = useState(false);
  const { role } = useCompanyPermissions();
  const podeRegistrar = role === "owner" || role === "admin";
  const [ausenciaOpen, setAusenciaOpen] = useState(false);
  const [ausenciaData, setAusenciaData] = useState<string | null>(null);
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const [avulsaData, setAvulsaData] = useState<string | null>(null);
  const [avulsaEditando, setAvulsaEditando] = useState<PessoaAvulsaPanorama | null>(null);

  /** Vinda do calendário de folgas: /dp/operacao?ausencia=AAAA-MM-DD. */
  useEffect(() => {
    const preset = params.get("ausencia");
    if (preset && /^\d{4}-\d{2}-\d{2}$/.test(preset)) {
      setAusenciaData(preset);
      setAusenciaOpen(true);
      params.delete("ausencia");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

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

  /** Blocos de um dia pelos períodos de funcionamento da loja, agrupados por cargo. */
  const blocosDe = (iso: string, d: DiaPanorama | undefined) => {
    if (!d) return [];
    const trabalhando = d.pessoas.filter(
      (p) => p.categoria === "fixo" || p.categoria === "convocado_aceito" || p.categoria === "convocado_pendente",
    );
    return blocosPorFuncionamento({
      data: iso,
      pessoas: trabalhando,
      funcionamentoPorUnidade: panorama.funcionamentoPorUnidade,
      unidades: panorama.unidades,
      unidadeId,
    });
  };

  /** Sócios em folga ou férias no dia — substitui o antigo card de carga. */
  const sociosDe = (d: DiaPanorama | undefined) =>
    (d?.pessoas ?? []).filter(
      (p) => p.socio && ["folga_padrao", "folga_extra", "ferias"].includes(p.categoria),
    );

  const blocos = useMemo(
    () => blocosDe(data, dia),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dia, data, unidadeId, panorama.funcionamentoPorUnidade, panorama.unidades],
  );
  const sociosAusentes = useMemo(() => sociosDe(dia), [dia]);

  const diaPopout = dataPopout ? panorama.diaDe(dataPopout) : undefined;
  const nomesColaboradores = useMemo(
    () => new Map(panorama.colaboradores.map((c) => [c.id, c.nome])),
    [panorama.colaboradores],
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

  const abrirNovaAvulsa = (iso: string) => {
    setAvulsaEditando(null);
    setAvulsaData(iso);
    setAvulsaOpen(true);
  };

  const abrirEdicaoAvulsa = (registro: PessoaAvulsaPanorama) => {
    setAvulsaEditando(registro);
    setAvulsaData(registro.data_inicio);
    setAvulsaOpen(true);
  };

  const salvarAvulsa = (input: PessoaAvulsaInput) =>
    panorama.salvarAvulsa.mutate(input, {
      onSuccess: () => {
        toast.success(input.id ? "Pessoa avulsa atualizada." : "Pessoa avulsa registrada no dia.");
        setAvulsaOpen(false);
        setAvulsaEditando(null);
      },
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível salvar."),
    });

  const excluirAvulsa = (registro: PessoaAvulsaPanorama) =>
    panorama.excluirAvulsa.mutate(registro.id, {
      onSuccess: () => toast.success("Pessoa avulsa removida do dia."),
      onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível remover."),
    });

  const propsAvulsas = {
    avulsos: panorama.avulsos,
    podeRegistrar,
    onNovaAvulsa: abrirNovaAvulsa,
    onEditarAvulsa: abrirEdicaoAvulsa,
    onExcluirAvulsa: excluirAvulsa,
    onVerAvulso: setDetalheAvulso,
  };

  if (panorama.error) return <DpErrorState message="Não foi possível carregar a operação." />;


  // Os diálogos de detalhe seguem o dia aberto na janela, quando houver.
  const dataAtiva = dataPopout ?? data;
  const diaAtivo = diaPopout ?? dia;

  // Sócios ausentes seguem visíveis nas listas (com a tag "Folga sócio"),
  // mesmo não somando nos números dos cards de folga/férias.
  const pessoasDaCategoria = detalheCategoria
    ? (diaAtivo?.pessoas ?? []).filter((p) => p.categoria === detalheCategoria)
    : [];
  const sociosDoDialogo = sociosDe(diaAtivo);
  const avulsosDoDiaAtivo = detalheAvulso
    ? (diaAtivo?.pessoas ?? []).filter(
        (p) => p.origem === "avulso" && p.avulso_tipo === (detalheAvulso === "avulso_teste" ? "teste" : "folguista"),
      )
    : [];


  /** Sócio ausente sem obrigação CLT: exibido com tag própria. */
  const tagSocio = (p: PessoaPanorama) =>
    p.socio && ["folga_padrao", "folga_extra", "ferias"].includes(p.categoria) && !p.socio_integrado;


  return (
    <DpPage>
      <Helmet>
        <title>Operação | Pessoas Aveto 360</title>
        <meta
          name="description"
          content="Acompanhe quantos colaboradores fixos, intermitentes convocados, folgas, férias e atestados a operação tem em cada dia."
        />
      </Helmet>

      <DpPageHeader
        title="Operação"
        description="Quantas pessoas a operação tem em cada dia — sem precisar gerar escala."
        icon={CalendarClock}
        actions={
          podeRegistrar ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setAvulsaEditando(null);
                  setAvulsaData(data);
                  setAvulsaOpen(true);
                }}
              >
                <UserPlus className="h-4 w-4" /> Adicionar Pessoa
              </Button>
              <Button
                className="gap-2"
                onClick={() => {
                  setAusenciaData(null);
                  setAusenciaOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Registrar Ausência
              </Button>
            </div>
          ) : undefined
        }
      />

      <DpRegistrarAusenciaDialog
        open={ausenciaOpen}
        onOpenChange={setAusenciaOpen}
        dataInicial={ausenciaData}
      />

      <DpPessoaAvulsaDialog
        open={avulsaOpen}
        onOpenChange={(o) => {
          setAvulsaOpen(o);
          if (!o) setAvulsaEditando(null);
        }}
        dataInicial={avulsaData ?? data}
        unidadePadrao={unidadeId}
        unidades={panorama.unidades}
        cargos={panorama.cargos}
        colaboradores={panorama.colaboradores}
        registro={avulsaEditando}
        salvando={panorama.salvarAvulsa.isPending}
        sugerirHorario={panorama.sugerirHorario}
        onSalvar={salvarAvulsa}
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
            <DetalheDiaOperacao
              data={data}
              dia={dia}
              blocos={blocos}
              sociosAusentes={sociosAusentes}
              ausenciasRegistradas={panorama.ausenciasRegistradas ?? []}
              nomesColaboradores={nomesColaboradores}
              unidadeId={unidadeId}
              nomeUnidade={nomeUnidade}
              ordemCards={ordemDia}
              onReordenarCards={(next) => salvarOrdem("dia", next)}
              onVerCategoria={setDetalheCategoria}
              onVerSocios={() => setVerSocios(true)}
              onDispensar={dispensar}
              onReativar={reativar}
              {...propsAvulsas}
            />
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
                      onClick={() => setDataPopout(d.data)}
                      className={`relative rounded-md border p-1.5 text-left transition-colors hover:bg-muted/50 ${
                        d.alerta
                          ? d.avaliacao.situacao === "abaixo"
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-amber-500/50 bg-amber-500/5"
                          : "border-border"
                      } ${d.data === data ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="mb-1 flex items-start justify-between">
                        <span
                          className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                            d.data === data
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {Number(d.data.slice(-2))}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {d.dispensado && <Check className="h-3 w-3 text-muted-foreground" />}
                          {d.alerta && <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
                          {diasComSocioAusente.has(d.data) && (
                            <span
                              aria-label="Sócio em folga ou férias"
                              className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            />
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">{d.trabalhando}</span> confirmado(s)
                      </p>
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
                          onClick={() => setDataPopout(d.data)}
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

      <Dialog open={!!dataPopout} onOpenChange={(o) => !o && setDataPopout(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="first-letter:uppercase">
              {dataPopout ? dataExtenso(dataPopout) : ""}
            </DialogTitle>
            <DialogDescription>Rotina prevista para o dia</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {dataPopout && diaPopout ? (
              <DetalheDiaOperacao
                data={dataPopout}
                dia={diaPopout}
                blocos={blocosDe(dataPopout, diaPopout)}
                sociosAusentes={sociosDe(diaPopout)}
                ausenciasRegistradas={panorama.ausenciasRegistradas ?? []}
                nomesColaboradores={nomesColaboradores}
                unidadeId={unidadeId}
                nomeUnidade={nomeUnidade}
                ordemCards={ordemDia}
                onReordenarCards={(next) => salvarOrdem("dia", next)}
                onVerCategoria={setDetalheCategoria}
                onVerSocios={() => setVerSocios(true)}
                onDispensar={dispensar}
                onReativar={reativar}
                {...propsAvulsas}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados para este dia.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDataPopout(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={verSocios} onOpenChange={setVerSocios}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Folga Sócio</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(dataAtiva)}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {sociosDoDialogo.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm">{p.nome}</span>
                <Badge variant="outline">{p.categoria === "ferias" ? "Férias" : "Folga"}</Badge>
              </li>
            ))}
            {!sociosDoDialogo.length && (
              <li className="py-2 text-sm text-muted-foreground">Nenhum sócio ausente neste dia.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalheCategoria} onOpenChange={(o) => !o && setDetalheCategoria(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detalheCategoria ? CATEGORIA_LABEL[detalheCategoria] : ""}</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(dataAtiva)}</DialogDescription>
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

      <Dialog open={!!detalheAvulso} onOpenChange={(o) => !o && setDetalheAvulso(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detalheAvulso ? AVULSO_LABEL[detalheAvulso] : ""}</DialogTitle>
            <DialogDescription className="first-letter:uppercase">{dataExtenso(dataAtiva)}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {avulsosDoDiaAtivo.map((p) => (
              <li key={p.colaborador_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="block truncate text-sm">{p.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.entrada ? `${p.entrada} às ${p.saida ?? "--:--"}` : "—"}
                    {p.cobre_nome ? ` · cobrindo ${p.cobre_nome}` : ""}
                  </span>
                </div>
                <Badge variant="secondary">{p.avulso_tipo === "teste" ? "Em teste" : "Folguista"}</Badge>
              </li>
            ))}
            {!avulsosDoDiaAtivo.length && (
              <li className="py-2 text-sm text-muted-foreground">Nenhuma pessoa avulsa neste dia.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
