import { tratativaPendente, tratativaJaDecididaPorAtestado, ocorrenciaDeFolga, diretrizPonto, DIRETRIZ_LABEL, DECISAO_TRATATIVA_LABEL, temControlePonto } from "@/lib/dp/ocorrencias";
import { nomeExibicao } from "@/lib/dp/nomeExibicao";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MoreHorizontal,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { resumoTratativa } from "@/lib/dp/ocorrencia-resumo";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
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
    weekday: "short",
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
  const ajustavel = !cancelada && ["esquecimento_marcacao", "divergencia_jornada"].includes(o.tipo);
  const controleLancamento = !cancelada && !tratarPendente && o.tratativa_status !== "pendente" && !!onLancado && comPonto;
  const conferirPendente = !tratarPendente && !folgaAutorizada && o.subtipo !== "dispensa_aviso_art488" && o.analise_status === "pendente" && !cancelada;

  return (
    <div className={cn("rounded-lg border p-4 sm:p-5", COR_CLASSE[cor])}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold break-words">{nomeExibicao(o.colaborador) || "Colaborador"}</span>
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
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
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
            <p className="mt-3 border-l-2 border-border py-1 pl-3 text-sm leading-relaxed italic text-muted-foreground break-words">“{o.justificativa_inicial}”</p>
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
            <p className="mt-1 flex flex-wrap items-center gap-1 rounded-md border border-warning/40 bg-warning/5 px-2 py-1 text-xs">
              <ShieldAlert className="h-3.5 w-3.5 text-warning" />
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
          {controleLancamento && (
            <Badge variant="outline" className="mt-2 gap-1 text-xs">
              {o.lancado_ponto_em ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              {o.lancado_ponto_em ? "Lançado" : "Lançamento pendente"}
            </Badge>
          )}
        </div>

        <div className="mt-4 flex w-full flex-wrap items-center gap-2 border-t border-border pt-4 sm:mt-0 sm:w-full [&_button]:min-h-11">
          {!cancelada && (tratarPendente || conferirPendente || ajustavel || o.estado === "aguardando_confirmacao") && (
            <Button className="min-h-12 min-w-0 flex-1 whitespace-normal" onClick={o.estado === "aguardando_confirmacao" ? onConfirmar : tratarPendente || ajustavel ? onTratativa : onAnalisar}>
              <ClipboardCheck className="mr-2 h-4 w-4 shrink-0" />
              {o.estado === "aguardando_confirmacao" || !comPonto ? "Conferir ocorrência" : "Tratar ponto"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" aria-label="Mais ações" title="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="[&_[role=menuitem]]:min-h-11">
              {cobrivel && onCobrir && <DropdownMenuItem onSelect={onCobrir}>{validas.length ? "Ver cobertura" : "Cobrir ausência"}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setDetalhes(true)}>Ver detalhes e impactos</DropdownMenuItem>
              {controleLancamento && <DropdownMenuItem onSelect={() => onLancado?.(!o.lancado_ponto_em)}>{o.lancado_ponto_em ? "Desfazer lançamento" : "Marcar como lançado"}</DropdownMenuItem>}
              {estadoPremio === "aguardando" && !cancelada && onDecidirAssiduidade && <DropdownMenuItem onSelect={onDecidirAssiduidade}>Decidir prêmio</DropdownMenuItem>}
              {onHistorico && <DropdownMenuItem onSelect={onHistorico}>Histórico</DropdownMenuItem>}
              {!cancelada && !folgaAutorizada && <DropdownMenuItem onSelect={onCancelar}>Cancelar ocorrência</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ResponsiveDialog open={detalhes} onOpenChange={setDetalhes} title="Detalhes da ocorrência" description={nomeExibicao(o.colaborador) || "Colaborador"}>
        <div className="space-y-4 text-sm">
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
          <div className="flex flex-col gap-4">
            {(["assiduidade", "ferias"] as const).map((campo) => (
              <div key={campo} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">{campo === "assiduidade" ? "Perde assiduidade" : "Desconta férias"}</span>
                <Select
                  value={campo === "assiduidade" ? o.impacta_assiduidade : o.impacta_ferias}
                  onValueChange={(v) => onImpacto(campo, v as OcorrenciaImpacto)}
                  disabled={cancelada || folgaAutorizada}
                >
                  <SelectTrigger className="min-h-11 w-[150px] text-sm">
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
        </div>
      </ResponsiveDialog>
    </div>
  );
}
