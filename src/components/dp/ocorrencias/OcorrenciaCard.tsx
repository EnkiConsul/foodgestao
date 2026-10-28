import { tratativaPendente, tratativaJaDecididaPorAtestado, ocorrenciaDeFolga, diretrizPonto, DIRETRIZ_LABEL, DECISAO_TRATATIVA_LABEL, temControlePonto } from "@/lib/dp/ocorrencias";
import { nomeExibicao } from "@/lib/dp/nomeExibicao";
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
  rotuloTipoOcorrencia,
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
  onLancado?: (v: boolean) => void;
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
  onLancado,
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
  const folgaAutorizada = ocorrenciaDeFolga(o);
  const diretriz = diretrizPonto(o);
  const tratarPendente = tratativaPendente(o);
  const comPonto = temControlePonto(o);
  const abonoAtestado = !cancelada && tratativaJaDecididaPorAtestado(o) && o.tratativa_status === "pendente";
  const conferirPendente = !tratarPendente && !folgaAutorizada && o.subtipo !== "dispensa_aviso_art488" && o.analise_status === "pendente" && !cancelada;

  return (
    <div className={cn("rounded-lg border p-3", COR_CLASSE[cor])}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{nomeExibicao(o.colaborador) || "Colaborador"}</span>
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
            {!r.batida && !r.horario && resumoOperacional(o) !== r.titulo && (
              <span className="text-xs text-muted-foreground">{resumoOperacional(o)}</span>
            )}
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
          {abonoAtestado && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" /> Atestado aprovado · abonar o dia no ponto
            </p>
          )}
          {folgaAutorizada && !cancelada && diretriz && (
            <p className="mt-1 text-xs text-muted-foreground">
              {DIRETRIZ_LABEL[diretriz]} · Sem impacto na assiduidade ou férias
            </p>
          )}
          {!tratarPendente && !folgaAutorizada && o.tratativa_status !== "pendente" && o.tratativa_ponto && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" />{" "}
              {(o.tratativa_decisao && DECISAO_TRATATIVA_LABEL[o.tratativa_decisao]) || TRATATIVA_LABEL[o.tratativa_status]}
              {o.tratativa_observacao ? ` · ${o.tratativa_observacao}` : ""}
            </p>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          {o.estado === "aguardando_confirmacao" && (
            <Button size="sm" variant="outline" onClick={onConfirmar}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar
            </Button>
          )}
          {tratarPendente && (
            <Button size="sm" onClick={onTratativa}>
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> {comPonto ? "Tratar ponto" : "Conferir ocorrência"}
            </Button>
          )}
          {!tratarPendente && !cancelada && ["esquecimento_marcacao", "divergencia_jornada"].includes(o.tipo) && (
            <Button size="sm" variant="outline" onClick={onTratativa}>
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Ajustar horário
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
          {onLancado && !cancelada && comPonto && (
            <Button
              size="sm"
              variant={o.lancado_ponto_em ? "secondary" : "outline"}
              title={o.lancado_ponto_em ? "Clique para desmarcar" : "Marque depois de lançar no seu sistema de ponto"}
              onClick={() => onLancado(!o.lancado_ponto_em)}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              {o.lancado_ponto_em ? "Lançado no ponto" : "Marcar como lançado"}
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
            {rotuloTipoOcorrencia(o)} · {ESTADO_LABEL[o.estado]} · {ORIGEM_LABEL[o.origem]}
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
                <span className="text-muted-foreground">{campo === "assiduidade" ? "Perde assiduidade" : "Desconta férias"}</span>
                <Select
                  value={campo === "assiduidade" ? o.impacta_assiduidade : o.impacta_ferias}
                  onValueChange={(v) => onImpacto(campo, v as OcorrenciaImpacto)}
                  disabled={cancelada || folgaAutorizada}
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
            {!cancelada && !folgaAutorizada && (
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
