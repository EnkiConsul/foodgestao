import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpFilterField, DpFilters } from "@/components/dp/DpFilters";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { MotivoDialog } from "@/components/dp/MotivoDialog";
import { OcorrenciaCard } from "@/components/dp/ocorrencias/OcorrenciaCard";
import { OcorrenciaConfirmarDialog } from "@/components/dp/ocorrencias/OcorrenciaConfirmarDialog";
import { OcorrenciaFormDialog } from "@/components/dp/ocorrencias/OcorrenciaFormDialog";
import { OcorrenciaTratativaDialog } from "@/components/dp/ocorrencias/OcorrenciaTratativaDialog";
import {
  ANALISE_LABEL,
  ESTADO_LABEL,
  IMPACTO_LABEL,
  TIPOS_ORDEM,
  TIPO_LABEL,
  TRATATIVA_LABEL,
  type OcorrenciaAnalise,
  type OcorrenciaEstado,
  type OcorrenciaImpacto,
  type OcorrenciaTratativa,
} from "@/lib/dp/ocorrencias";
import {
  FILTROS_PADRAO,
  useDpOcorrencias,
  type Ocorrencia,
  type OcorrenciaFiltros,
  type OcorrenciaPeriodo,
} from "@/hooks/useDpOcorrencias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";

const PERIODOS: { value: OcorrenciaPeriodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "todas", label: "Todas" },
];

export default function DpOcorrencias() {
  const embedded = useDpEmbedded();
  const [filtros, setFiltros] = useState<OcorrenciaFiltros>(FILTROS_PADRAO);
  const [novaOpen, setNovaOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<Ocorrencia | null>(null);
  const [tratativa, setTratativa] = useState<Ocorrencia | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);

  const set = <K extends keyof OcorrenciaFiltros>(k: K, v: OcorrenciaFiltros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  const acoes = useDpOcorrencias(filtros);
  const { data: colaboradores = [] } = useDpColaboradores();
  const { data: unidades = [] } = useDpUnidades();
  const { setores } = useDpSetores(filtros.unidadeId === "all" ? null : filtros.unidadeId);

  const colaboradoresAtivos = useMemo(
    () => colaboradores.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })),
    [colaboradores],
  );

  const activeCount = useMemo(() => {
    const chaves: (keyof OcorrenciaFiltros)[] = [
      "colaboradorId",
      "unidadeId",
      "setorId",
      "tipo",
      "estado",
      "analise",
      "impactaAssiduidade",
      "impactaFerias",
      "tratativa",
    ];
    return chaves.filter((k) => filtros[k] !== "all").length + (filtros.somentePendentes ? 1 : 0);
  }, [filtros]);

  return (
    <DpPage>
      {!embedded && (
        <Helmet>
          <title>Ocorrências — Pessoas 360°</title>
          <meta
            name="description"
            content="Registre faltas, atrasos, saídas antecipadas, atestados e problemas de ponto e acompanhe a decisão do gestor."
          />
        </Helmet>
      )}
      <DpPageHeader
        icon={ClipboardList}
        title="Ocorrências"
        description="O que estava previsto na jornada e o que realmente aconteceu. Não altera o ponto: registra o fato, a justificativa e a decisão."
        actions={
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar ocorrência
          </Button>
        }
      />

      <Tabs value={filtros.periodo} onValueChange={(v) => set("periodo", v as OcorrenciaPeriodo)}>
        <TabsList>
          {PERIODOS.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DpFilters
        search={{
          value: filtros.busca,
          onChange: (v) => set("busca", v),
          placeholder: "Buscar colaborador...",
        }}
        activeCount={activeCount}
        onClear={() => setFiltros({ ...FILTROS_PADRAO, periodo: filtros.periodo, somentePendentes: false })}
        columns={4}
      >
        <DpFilterField label="Colaborador">
          <Select value={filtros.colaboradorId} onValueChange={(v) => set("colaboradorId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {colaboradoresAtivos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Unidade">
          <Select
            value={filtros.unidadeId}
            onValueChange={(v) => {
              set("unidadeId", v);
              set("setorId", "all");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Setor">
          <Select value={filtros.setorId} onValueChange={(v) => set("setorId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {setores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Tipo">
          <Select value={filtros.tipo} onValueChange={(v) => set("tipo", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {TIPOS_ORDEM.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Estado">
          <Select value={filtros.estado} onValueChange={(v) => set("estado", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(ESTADO_LABEL) as OcorrenciaEstado[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Análise">
          <Select value={filtros.analise} onValueChange={(v) => set("analise", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(ANALISE_LABEL) as OcorrenciaAnalise[]).map((a) => (
                <SelectItem key={a} value={a}>
                  {ANALISE_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Impacto na assiduidade">
          <Select value={filtros.impactaAssiduidade} onValueChange={(v) => set("impactaAssiduidade", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(IMPACTO_LABEL) as OcorrenciaImpacto[]).map((i) => (
                <SelectItem key={i} value={i}>
                  {IMPACTO_LABEL[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Impacto nas férias">
          <Select value={filtros.impactaFerias} onValueChange={(v) => set("impactaFerias", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(Object.keys(IMPACTO_LABEL) as OcorrenciaImpacto[]).map((i) => (
                <SelectItem key={i} value={i}>
                  {IMPACTO_LABEL[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Tratativa de ponto">
          <Select value={filtros.tratativa} onValueChange={(v) => set("tratativa", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(Object.keys(TRATATIVA_LABEL) as OcorrenciaTratativa[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TRATATIVA_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Pendências">
          <div className="flex h-10 items-center gap-2">
            <Switch
              id="pendentes"
              checked={filtros.somentePendentes}
              onCheckedChange={(v) => set("somentePendentes", v)}
            />
            <Label htmlFor="pendentes" className="text-sm font-normal">
              Só o que falta tratar
            </Label>
          </div>
        </DpFilterField>
      </DpFilters>

      <DpContentCard>
        {acoes.loading ? (
          <TableSkeleton rows={5} />
        ) : acoes.ocorrencias.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma ocorrência nesse período com os filtros escolhidos.
          </p>
        ) : (
          <div className="space-y-2">
            {acoes.ocorrencias.map((o) => (
              <OcorrenciaCard
                key={o.id}
                ocorrencia={o}
                onConfirmar={() => setConfirmar(o)}
                onTratativa={() => setTratativa(o)}
                onAnalisar={() => acoes.analisar.mutate({ id: o.id, status: "analisada" })}
                onCancelar={() => setCancelarId(o.id)}
                onImpacto={(campo, valor) =>
                  acoes.classificar.mutate(
                    campo === "assiduidade"
                      ? { id: o.id, impactaAssiduidade: valor }
                      : { id: o.id, impactaFerias: valor },
                  )
                }
              />
            ))}
          </div>
        )}
      </DpContentCard>

      <OcorrenciaFormDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        colaboradores={colaboradoresAtivos}
        saving={acoes.registrar.isPending}
        onSubmit={(input) =>
          acoes.registrar.mutate(input, { onSuccess: () => setNovaOpen(false) })
        }
      />

      <OcorrenciaConfirmarDialog
        ocorrencia={confirmar}
        onOpenChange={(open) => !open && setConfirmar(null)}
        saving={acoes.confirmar.isPending}
        onConfirm={(input) =>
          confirmar &&
          acoes.confirmar.mutate(
            { id: confirmar.id, ...input },
            { onSuccess: () => setConfirmar(null) },
          )
        }
        onNaoAconteceu={(motivo) =>
          confirmar &&
          acoes.confirmar.mutate(
            { id: confirmar.id, confirmar: false, justificativaFinal: motivo },
            { onSuccess: () => setConfirmar(null) },
          )
        }
      />

      <OcorrenciaTratativaDialog
        ocorrencia={tratativa}
        onOpenChange={(open) => !open && setTratativa(null)}
        saving={acoes.tratar.isPending}
        onSubmit={({ decisao, observacao }) =>
          tratativa &&
          acoes.tratar.mutate(
            { id: tratativa.id, decisao, observacao },
            { onSuccess: () => setTratativa(null) },
          )
        }
      />

      <MotivoDialog
        open={!!cancelarId}
        onOpenChange={(open) => !open && setCancelarId(null)}
        title="Cancelar ocorrência"
        description="Cancele apenas quando o registro estiver errado. O histórico do que aconteceu é preservado."
        confirmLabel="Cancelar ocorrência"
        loading={acoes.cancelar.isPending}
        onConfirm={(motivo) =>
          cancelarId &&
          acoes.cancelar.mutate({ id: cancelarId, motivo }, { onSuccess: () => setCancelarId(null) })
        }
      />
    </DpPage>
  );
}
