import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, User, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ANALISE_LABEL,
  COR_BADGE,
  COR_CLASSE,
  ESTADO_LABEL,
  IMPACTO_LABEL,
  MARCACAO_LABEL,
  ORIGEM_LABEL,
  TIPOS_PREVISAO,
  TIPO_LABEL,
  TRATATIVA_LABEL,
  corOcorrencia,
  resumoOperacional,
  type OcorrenciaImpacto,
} from "@/lib/dp/ocorrencias";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia;
  onConfirmar: () => void;
  onTratativa: () => void;
  onAnalisar: () => void;
  onCancelar: () => void;
  onImpacto: (campo: "assiduidade" | "ferias", valor: OcorrenciaImpacto) => void;
}

const IMPACTOS: OcorrenciaImpacto[] = ["sim", "nao", "aguardando", "nao_se_aplica"];

export function OcorrenciaCard({
  ocorrencia: o,
  onConfirmar,
  onTratativa,
  onAnalisar,
  onCancelar,
  onImpacto,
}: Props) {
  const cor = corOcorrencia(o);
  const previsao = TIPOS_PREVISAO.includes(o.tipo);
  const data = new Date(`${o.data_operacional}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <div className={cn("rounded-lg border p-3", COR_CLASSE[cor])}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{o.colaborador?.nome ?? "Colaborador"}</span>
            <Badge variant="outline" className="text-xs">
              {data}
            </Badge>
            <Badge variant="outline" className={cn("text-xs", COR_BADGE[cor])}>
              {previsao && <AlertTriangle className="mr-1 h-3 w-3" />}
              {resumoOperacional(o)}
            </Badge>
            {o.estado === "cancelada" && (
              <Badge variant="outline" className="text-xs">
                Cancelada
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {TIPO_LABEL[o.tipo]}
            {o.marcacao_alvo ? ` · ${MARCACAO_LABEL[o.marcacao_alvo]}` : ""} · {ESTADO_LABEL[o.estado]} ·{" "}
            {ORIGEM_LABEL[o.origem]}
            {o.unidade?.nome ? ` · ${o.unidade.nome}` : ""}
            {o.setor?.nome ? ` · ${o.setor.nome}` : ""}
          </p>
          {(o.previsto_entrada || o.previsto_saida) && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Jornada prevista {o.previsto_entrada?.slice(0, 5) ?? "--"} às{" "}
              {o.previsto_saida?.slice(0, 5) ?? "--"}
            </p>
          )}
          {o.justificativa_inicial && (
            <p className="mt-1 text-xs">
              <span className="text-muted-foreground">Informado: </span>
              {o.justificativa_inicial}
            </p>
          )}
          {o.justificativa_final && (
            <p className="text-xs">
              <span className="text-muted-foreground">Depois: </span>
              {o.justificativa_final}
            </p>
          )}
          {o.tratativa_observacao && (
            <p className="text-xs">
              <span className="text-muted-foreground">Tratativa: </span>
              {o.tratativa_observacao}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {o.estado === "aguardando_confirmacao" && (
            <Button size="sm" variant="outline" onClick={onConfirmar}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar
            </Button>
          )}
          {o.tratativa_ponto && o.tratativa_status === "pendente" && (
            <Button size="sm" variant="outline" onClick={onTratativa}>
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" /> Tratativa
            </Button>
          )}
          {o.analise_status === "pendente" && o.estado !== "cancelada" && (
            <Button size="sm" variant="outline" onClick={onAnalisar}>
              <User className="mr-1 h-3.5 w-3.5" /> Marcar analisada
            </Button>
          )}
          {o.estado !== "cancelada" && (
            <Button size="sm" variant="ghost" onClick={onCancelar}>
              <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Assiduidade</span>
          <Select
            value={o.impacta_assiduidade}
            onValueChange={(v) => onImpacto("assiduidade", v as OcorrenciaImpacto)}
            disabled={o.estado === "cancelada"}
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Férias</span>
          <Select
            value={o.impacta_ferias}
            onValueChange={(v) => onImpacto("ferias", v as OcorrenciaImpacto)}
            disabled={o.estado === "cancelada"}
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
        <Badge variant="outline" className="text-xs">
          {ANALISE_LABEL[o.analise_status]}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {TRATATIVA_LABEL[o.tratativa_status]}
        </Badge>
      </div>
    </div>
  );
}
