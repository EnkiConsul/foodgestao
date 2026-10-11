import { cn } from "@/lib/utils";
import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpPage, DpPageHeader, DpContentCard, useDpEmbedded } from "@/components/dp/DpPage";
import { DpFilterField, DpFilters } from "@/components/dp/DpFilters";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { mensagemErro } from "@/lib/dp/mensagemErro";
import { MotivoDialog } from "@/components/dp/MotivoDialog";
import { OcorrenciaCard } from "@/components/dp/ocorrencias/OcorrenciaCard";
import { OcorrenciaConfirmarDialog } from "@/components/dp/ocorrencias/OcorrenciaConfirmarDialog";
import { OcorrenciaFormDialog } from "@/components/dp/ocorrencias/OcorrenciaFormDialog";
import { OcorrenciaTratativaDialog } from "@/components/dp/ocorrencias/OcorrenciaTratativaDialog";
import { AssiduidadeDecisaoDialog } from "@/components/dp/ocorrencias/AssiduidadeDecisaoDialog";
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
import { useDpPessoasApoio } from "@/hooks/useDpPessoasApoio";
import { OcorrenciaCoberturaDialog } from "@/components/dp/ocorrencias/OcorrenciaCoberturaDialog";
import { OcorrenciaHistoricoDialog } from "@/components/dp/ocorrencias/OcorrenciaHistoricoDialog";
import { useDpOcorrenciasIndicadores } from "@/hooks/useDpOcorrenciasIndicadores";
import type { SubstitutoOpcao } from "@/components/dp/ocorrencias/SubstitutoPicker";

function mesCorrente(): { inicio: string; fim: string } {
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

const COBERTURAS: { value: string; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sem", label: "Sem cobertura" },
  { value: "proposta", label: "Cobertura proposta" },
  { value: "aprovada", label: "Cobertura aprovada" },
  { value: "realizada", label: "Cobertura realizada" },
];


const PERIODOS: { value: OcorrenciaPeriodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "todas", label: "Todas" },
];

export default function DpOcorrencias() {
  const embedded = useDpEmbedded();
  const [searchParams] = useSearchParams();
  const colaboradorParam = searchParams.get("colaborador");
  const dataParam = searchParams.get("data");
  const [filtros, setFiltros] = useState<OcorrenciaFiltros>(
    colaboradorParam || dataParam
      ? {
          ...FILTROS_PADRAO,
          colaboradorId: colaboradorParam ?? "all",
          data: dataParam ?? null,
          periodo: "mes",
          somentePendentes: false,
        }
      : FILTROS_PADRAO,
  );
  const [novaOpen, setNovaOpen] = useState(false);

  const [confirmar, setConfirmar] = useState<Ocorrencia | null>(null);
  const [tratativa, setTratativa] = useState<Ocorrencia | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [cobrir, setCobrir] = useState<Ocorrencia | null>(null);
  const [historico, setHistorico] = useState<Ocorrencia | null>(null);
  const [decidirPremio, setDecidirPremio] = useState<Ocorrencia | null>(null);
  const mes = useMemo(() => mesCorrente(), []);


  const set = <K extends keyof OcorrenciaFiltros>(k: K, v: OcorrenciaFiltros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  const acoes = useDpOcorrencias(filtros);
  const { data: colaboradores = [] } = useDpColaboradores();
  const { data: unidades = [] } = useDpUnidades();
  const { setores } = useDpSetores(filtros.unidadeId === "all" ? null : filtros.unidadeId);
  const { data: pessoasApoio = [] } = useDpPessoasApoio({ apenasAtivos: true });
  const { indicadores } = useDpOcorrenciasIndicadores({
    inicio: mes.inicio,
    fim: mes.fim,
    unidadeId: filtros.unidadeId,
  });

  const colaboradoresAtivos = useMemo(
    () => colaboradores.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })),
    [colaboradores],
  );

  // O colaborador vindo do atalho pode estar inativo: garantimos que ele
  // apareça selecionado no filtro mesmo assim.
  const opcoesColaborador = useMemo(() => {
    const alvo = filtros.colaboradorId;
    if (alvo === "all" || colaboradoresAtivos.some((c) => c.id === alvo)) return colaboradoresAtivos;
    const extra = colaboradores.find((c) => c.id === alvo);
    return extra ? [{ id: extra.id, nome: `${extra.nome} (inativo)` }, ...colaboradoresAtivos] : colaboradoresAtivos;
  }, [colaboradoresAtivos, colaboradores, filtros.colaboradorId]);

  const opcoesSubstituto = useMemo<SubstitutoOpcao[]>(
    () => [
      ...pessoasApoio
        .filter((p) => !p.colaborador_id)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          detalhe: p.tipo === "folguista" ? "Folguista" : "Em teste",
          origem: "apoio" as const,
        })),
      ...colaboradoresAtivos.map((c) => ({ id: c.id, nome: c.nome, origem: "colaborador" as const })),
    ],
    [pessoasApoio, colaboradoresAtivos],
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
      "cobertura",
      "assiduidadeDecisao",
    ];
    return (
      chaves.filter((k) => filtros[k] !== "all").length +
      (filtros.periodo !== "todas" ? 1 : 0) +
      (filtros.somentePendentes ? 1 : 0) +
      (filtros.data ? 1 : 0)
    );
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

      {(() => {
        type CardInd = { key: string; label: string; valor: number; detalhe?: string; aplicar: Partial<OcorrenciaFiltros> };
        const cards: CardInd[] = [
          { key: "falta", label: "Faltas", valor: indicadores.porTipo.falta ?? 0, aplicar: { tipo: "falta" } },
          { key: "previsao_falta", label: "Previsões de falta", valor: indicadores.porTipo.previsao_falta ?? 0, aplicar: { tipo: "previsao_falta" } },
          {
            key: "atraso",
            label: "Atrasos",
            valor: indicadores.porTipo.atraso ?? 0,
            detalhe: indicadores.atraso_minutos
              ? (() => {
                  const m = indicadores.atraso_minutos;
                  const h = Math.floor(m / 60);
                  return h ? `${h}h${String(m % 60).padStart(2, "0")} somados` : `${m} min somados`;
                })()
              : undefined,
            aplicar: { tipo: "atraso" },
          },
          { key: "previsao_atraso", label: "Previsões de atraso", valor: indicadores.porTipo.previsao_atraso ?? 0, aplicar: { tipo: "previsao_atraso" } },
          { key: "saida_antecipada", label: "Saídas antecipadas", valor: indicadores.porTipo.saida_antecipada ?? 0, aplicar: { tipo: "saida_antecipada" } },
          { key: "previsao_saida_antecipada", label: "Previsões de saída", valor: indicadores.porTipo.previsao_saida_antecipada ?? 0, aplicar: { tipo: "previsao_saida_antecipada" } },
          { key: "atraso_intervalo", label: "Atrasos no intervalo", valor: indicadores.porTipo.atraso_intervalo ?? 0, aplicar: { tipo: "atraso_intervalo" } },
          { key: "previsao_atraso_intervalo", label: "Previsões no intervalo", valor: indicadores.porTipo.previsao_atraso_intervalo ?? 0, aplicar: { tipo: "previsao_atraso_intervalo" } },
          { key: "atestado", label: "Atestados", valor: indicadores.porTipo.atestado ?? 0, aplicar: { tipo: "atestado" } },
          { key: "ausencia_justificada", label: "Ausências justificadas", valor: indicadores.porTipo.ausencia_justificada ?? 0, aplicar: { tipo: "ausencia_justificada" } },
          { key: "esquecimento_marcacao", label: "Esquecimentos", valor: indicadores.porTipo.esquecimento_marcacao ?? 0, aplicar: { tipo: "esquecimento_marcacao" } },
          { key: "divergencia_jornada", label: "Erros de jornada", valor: indicadores.porTipo.divergencia_jornada ?? 0, aplicar: { tipo: "divergencia_jornada" } },
          {
            key: "cobertas",
            label: "Ausências cobertas",
            valor: indicadores.ausencias_cobertas,
            detalhe: indicadores.ausencias_descobertas ? `${indicadores.ausencias_descobertas} sem cobertura` : undefined,
            aplicar: { cobertura: "aprovada" },
          },
          { key: "pendentes", label: "Aguardando decisão", valor: indicadores.pendentes, aplicar: { somentePendentes: true } },
        ].filter((c) => Number(c.valor) > 0);
        if (cards.length === 0) return null;
        const ativo = (c: CardInd) =>
          Object.entries(c.aplicar).every(([k, v]) => filtros[k as keyof OcorrenciaFiltros] === v) && filtros.periodo === "mes";
        const clicar = (c: CardInd) => {
          if (ativo(c)) {
            setFiltros((f) => ({ ...f, tipo: "all", cobertura: "all", somentePendentes: false, periodo: "todas" }));
          } else {
            setFiltros((f) => ({ ...f, tipo: "all", cobertura: "all", somentePendentes: false, periodo: "mes", data: null, ...c.aplicar }));
          }
        };
        return (
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Neste mês · toque para filtrar</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {cards.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => clicar(c)}
                  aria-pressed={ativo(c)}
                  className={cn(
                    "rounded-lg border bg-card p-2 text-center shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 sm:p-3",
                    ativo(c) && "border-primary bg-primary/10",
                  )}
                >
                  <p className="truncate text-[10px] leading-tight text-muted-foreground sm:text-xs">{c.label}</p>
                  <p className="text-base font-bold leading-tight sm:text-lg">{c.valor}</p>
                  {c.detalhe && <p className="truncate text-[10px] text-muted-foreground">{c.detalhe}</p>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {filtros.data && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrando apenas o dia</span>
          <span className="font-medium">{filtros.data.split("-").reverse().join("/")}</span>
          <Button size="sm" variant="ghost" onClick={() => set("data", null)}>
            Ver o período todo
          </Button>
        </div>
      )}

      <DpFilters
        search={{
          value: filtros.busca,
          onChange: (v) => set("busca", v),
          placeholder: "Buscar colaborador...",
        }}
        activeCount={activeCount}
        onClear={() => setFiltros(FILTROS_PADRAO)}
        columns={4}
      >
        <DpFilterField label="Período">
          <Select value={filtros.periodo} onValueChange={(v) => set("periodo", v as OcorrenciaPeriodo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DpFilterField>

        <DpFilterField label="Colaborador">
          <Select value={filtros.colaboradorId} onValueChange={(v) => set("colaboradorId", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {opcoesColaborador.map((c) => (
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

        <DpFilterField label="Prêmio de assiduidade">
          <Select
            value={filtros.assiduidadeDecisao}
            onValueChange={(v) => set("assiduidadeDecisao", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Aguardando decisão do gestor</SelectItem>
              <SelectItem value="perde">Perdeu o prêmio</SelectItem>
              <SelectItem value="mantem">Prêmio mantido</SelectItem>
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

        <DpFilterField label="Cobertura">
          <Select value={filtros.cobertura} onValueChange={(v) => set("cobertura", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COBERTURAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
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
          <TableSkeleton rows={5} columns={4} />
        ) : acoes.isError ? (
          <DpErrorState message={mensagemErro(acoes.error)} onRetry={() => void acoes.refetch()} />
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
                coberturas={acoes.coberturasPorOcorrencia.get(o.id) ?? []}
                onConfirmar={() => setConfirmar(o)}
                onTratativa={() => setTratativa(o)}
                onAnalisar={() => acoes.analisar.mutate({ id: o.id, status: "analisada" })}
                onCancelar={() => setCancelarId(o.id)}
                onCobrir={() => setCobrir(o)}
                onHistorico={() => setHistorico(o)}
                onDecidirAssiduidade={() => setDecidirPremio(o)}

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
            {
              id: tratativa.id,
              decisao,
              observacao,
              marcarAnalisada: tratativa.analise_status === "pendente",
            },
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
      <OcorrenciaCoberturaDialog
        ocorrencia={cobrir}
        coberturas={cobrir ? acoes.coberturasPorOcorrencia.get(cobrir.id) ?? [] : []}
        opcoes={opcoesSubstituto}
        saving={
          acoes.criarCobertura.isPending ||
          acoes.decidirCobertura.isPending ||
          acoes.confirmarCobertura.isPending
        }
        onOpenChange={(open) => !open && setCobrir(null)}
        onCriar={(input) =>
          cobrir && acoes.criarCobertura.mutate({ ocorrenciaId: cobrir.id, ...input })
        }
        onDecidir={(input) => acoes.decidirCobertura.mutate(input)}
        onConfirmar={(id) => acoes.confirmarCobertura.mutate(id)}
      />
      <AssiduidadeDecisaoDialog
        ocorrencia={decidirPremio}
        saving={acoes.decidirAssiduidade.isPending}
        onOpenChange={(open) => !open && setDecidirPremio(null)}
        onDecidir={({ perde, observacao }) =>
          decidirPremio &&
          acoes.decidirAssiduidade.mutate(
            { id: decidirPremio.id, perde, observacao },
            { onSuccess: () => setDecidirPremio(null) },
          )
        }
      />
      <OcorrenciaHistoricoDialog
        ocorrencia={historico}
        onOpenChange={(open) => !open && setHistorico(null)}
      />
    </DpPage>

  );
}
