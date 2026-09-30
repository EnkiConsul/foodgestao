import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  History as HistoryIcon,
  ShieldAlert,
  UserPlus,
  XCircle,
} from "lucide-react";
import { resumoTratativa } from "@/lib/dp/ocorrencia-resumo";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ANALISE_LABEL,
  COBERTURA_EXECUCAO_LABEL,
  COBERTURA_STATUS_LABEL,
  COR_BADGE,
  COR_CLASSE,
  ESTADO_LABEL,
  IMPACTO_LABEL,
  MARCACAO_LABEL,
  ORIGEM_LABEL,
  TIPOS_COBRIVEIS,
  TIPOS_PREVISAO,
  TIPO_LABEL,
  TRATATIVA_LABEL,
  corOcorrencia,
  resumoOperacional,
  type OcorrenciaImpacto,
} from "@/lib/dp/ocorrencias";
import type { Ocorrencia, OcorrenciaCobertura } from "@/hooks/useDpOcorrencias";
import { ESTADO_ASSIDUIDADE_LABEL, estadoAssiduidade } from "@/lib/dp/assiduidade-risco";


interface Props {
  ocorrencia: Ocorrencia;
  coberturas?: OcorrenciaCobertura[];
  onConfirmar: () => void;
  onTratativa: () => void;
  onAnalisar: () => void;
  onCancelar: () => void;
  onCobrir?: () => void;
  onHistorico?: () => void;
  onImpacto: (campo: "assiduidade" | "ferias", valor: OcorrenciaImpacto) => void;
  onDecidirAssiduidade?: () => void;
}

const IMPACTOS: OcorrenciaImpacto[] = ["sim", "nao", "aguardando", "nao_se_aplica"];

export function OcorrenciaCard({
  ocorrencia: o,
  coberturas = [],
  onConfirmar,
  onTratativa,
  onAnalisar,
  onCancelar,
  onCobrir,
  onHistorico,
  onImpacto,
  onDecidirAssiduidade,
}: Props) {
  const [detalhes, setDetalhes] = useState(false);
  const estadoPremio = estadoAssiduidade(o);
  const validas = coberturas.filter((c) => c.status !== "recusada");
  const cobrivel = TIPOS_COBRIVEIS.includes(o.tipo) && o.estado !== "cancelada";

  const cor = corOcorrencia(o);
  const previsao = TIPOS_PREVISAO.includes(o.tipo);
  const data = new Date(`${o.data_operacional}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  const r = resumoTratativa(o);
  const cancelada = o.estado === "cancelada";
  const tratarPendente = o.tratativa_ponto && o.tratativa_status === "pendente" && !cancelada;
  const conferirPendente = !tratarPendente && o.analise_status === "pendente" && !cancelada;

  return (
    <div className={cn("rounded-lg border p-3", COR_CLASSE[cor])}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{o.colaborador?.nome ?? "Colaborador"}</span>
            <Badge variant="outline" className="text-xs">
              {data}
            </Badge>
            {cancelada && (
              <Badge variant="outline" className="text-xs">
                Cancelada
              </Badge>
            )}
          </div>

          {/* Linha principal: o que houve, em qual batida e a que horas */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant="outline" className={cn("text-xs", COR_BADGE[cor])}>
              {previsao && <AlertTriangle className="mr-1 h-3 w-3" />}
              {r.titulo}
            </Badge>
            {r.batida && <span className="font-medium">{r.batida}</span>}
            {r.horario && (
              <span className="flex items-center gap-1 text-base font-semibold tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                {r.horario}
              </span>
            )}
            {r.previsto && (
              <span className="text-xs text-muted-foreground">(previsto {r.previsto})</span>
            )}
            {!r.batida && !r.horario && <span className="text-xs text-muted-foreground">{resumoOperacional(o)}</span>}
          </p>

          {o.justificativa_inicial && (
            <p className="mt-1 text-sm italic text-muted-foreground">“{o.justificativa_inicial}”</p>
          )}

          {validas.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <UserPlus className="h-3 w-3" />
              Cobertura: {validas.map((c) => c.substituto?.nome ?? c.apoio?.nome ?? "sem nome").join(", ")}
              <Badge variant="outline" className="text-[10px]">
                {COBERTURA_STATUS_LABEL[validas[0].status]}
              </Badge>
            </p>
          )}
          {o.assiduidade_risco && (
            <p className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-medium">{ESTADO_ASSIDUIDADE_LABEL[estadoPremio]}</span>
              {o.assiduidade_risco_motivo ? ` · ${o.assiduidade_risco_motivo}` : ""}
            </p>
          )}
          {!tratarPendente && o.tratativa_status !== "pendente" && o.tratativa_ponto && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" /> {TRATATIVA_LABEL[o.tratativa_status]}
              {o.tratativa_observacao ? ` · ${o.tratativa_observacao}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {o.estado === "aguardando_confirmacao" && (
            <Button size="sm" variant="outline" onClick={onConfirmar}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar
            </Button>
          )}
          {tratarPendente && (
            <Button size="sm" onClick={onTratativa}>
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Tratar ponto
            </Button>
          )}
          {conferirPendente && (
            <Button size="sm" variant="outline" onClick={onAnalisar}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Conferido
            </Button>
          )}
          {estadoPremio === "aguardando" && !cancelada && onDecidirAssiduidade && (
            <Button size="sm" variant="outline" onClick={onDecidirAssiduidade}>
              <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Decidir prêmio
            </Button>
          )}
          {cobrivel && onCobrir && (
            <Button size="sm" variant={validas.length ? "ghost" : "outline"} onClick={onCobrir}>
              <UserPlus className="mr-1 h-3.5 w-3.5" />
              {validas.length ? "Ver cobertura" : "Cobrir"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDetalhes((v) => !v)}>
            {detalhes ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
            Detalhes
          </Button>
        </div>
      </div>

      {detalhes && (
        <div className="mt-3 space-y-2 border-t border-border pt-2 text-xs">
          <p className="text-muted-foreground">
            {TIPO_LABEL[o.tipo]} · {ESTADO_LABEL[o.estado]} · {ORIGEM_LABEL[o.origem]}
            {o.unidade?.nome ? ` · ${o.unidade.nome}` : ""}
            {o.setor?.nome ? ` · ${o.setor.nome}` : ""}
            {(o.previsto_entrada || o.previsto_saida) &&
              ` · Jornada ${o.previsto_entrada?.slice(0, 5) ?? "--"}–${o.previsto_saida?.slice(0, 5) ?? "--"}`}
          </p>
          {o.justificativa_final && (
            <p>
              <span className="text-muted-foreground">Depois: </span>
              {o.justificativa_final}
            </p>
          )}
          {validas.length > 0 && (
            <p className="text-muted-foreground">
              Execução da cobertura: {COBERTURA_EXECUCAO_LABEL[validas[0].execucao_status]}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {(["assiduidade", "ferias"] as const).map((campo) => (
              <div key={campo} className="flex items-center gap-2">
                <span className="text-muted-foreground">{campo === "assiduidade" ? "Assiduidade" : "Férias"}</span>
                <Select
                  value={campo === "assiduidade" ? o.impacta_assiduidade : o.impacta_ferias}
                  onValueChange={(v) => onImpacto(campo, v as OcorrenciaImpacto)}
                  disabled={cancelada}
                >
                  <SelectTrigger className="h-7 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPACTOS.map((i) => (
                      <SelectItem key={i} value={i} className="text-xs">
                        {IMPACTO_LABEL[i]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Badge variant="outline" className="text-xs">
              {ANALISE_LABEL[o.analise_status]}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {onHistorico && (
              <Button size="sm" variant="ghost" onClick={onHistorico}>
                <HistoryIcon className="mr-1 h-3.5 w-3.5" /> Histórico
              </Button>
            )}
            {!cancelada && (
              <Button size="sm" variant="ghost" onClick={onCancelar}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar ocorrência
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
