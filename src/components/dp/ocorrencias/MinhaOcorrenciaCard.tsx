import { Badge } from "@/components/ui/badge";
import { ANALISE_LABEL, ESTADO_LABEL, ORIGEM_LABEL, rotuloTipoOcorrencia, TIPOS_PREVISAO } from "@/lib/dp/ocorrencias";
import { impactoConfirmado, type MinhaOcorrencia } from "@/lib/dp/minhas-ocorrencias";

export function MinhaOcorrenciaCard({ ocorrencia: o, destaque = false }: { ocorrencia: MinhaOcorrencia; destaque?: boolean }) {
  const horario = o.horario_real ?? o.horario_estimado;
  const duracao = o.minutos !== null
    ? o.folga_id && o.minutos > 0 && o.minutos % 60 === 0 ? `${o.minutos / 60}h` : `${o.minutos} min`
    : null;
  return <article className={`min-w-0 rounded-md border bg-card p-4 space-y-2 ${destaque ? "border-primary" : "border-border"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="font-semibold break-words">{rotuloTipoOcorrencia(o)}</h3>
      <Badge variant="outline">{o.estado === "confirmada" ? "Fato confirmado" : ESTADO_LABEL[o.estado]}</Badge>
    </div>
    <p className="text-sm text-muted-foreground">{new Date(`${o.data_operacional}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}{horario ? ` · ${o.horario_real ? "Horário informado" : "Horário estimado"} ${horario.slice(0, 5)}` : ""}{duracao !== null ? ` · ${duracao}` : ""}</p>
    <p className="text-xs text-muted-foreground">{ORIGEM_LABEL[o.origem]}{TIPOS_PREVISAO.includes(o.tipo) ? " · Previsão, não confirmação do fato" : ""}</p>
    {o.justificativa_colaborador && <p className="text-sm whitespace-pre-wrap break-words"><span className="font-medium">Sua justificativa: </span>{o.justificativa_colaborador}</p>}
    {o.estado !== "cancelada" && <>
      <p className="text-sm">Gestor: {ANALISE_LABEL[o.analise_status]}{o.analisado_em ? ` em ${new Date(o.analisado_em).toLocaleDateString("pt-BR")}` : ""}</p>
      <p className="text-sm text-muted-foreground">Assiduidade: {impactoConfirmado(o) ? "impacto confirmado pelo gestor" : o.assiduidade_risco && !o.assiduidade_decidido_em ? "aguardando decisão do gestor" : o.impacta_assiduidade === "nao" ? "sem impacto registrado nesta ocorrência" : o.impacta_assiduidade === "nao_se_aplica" ? "não se aplica" : "sem impacto confirmado"}.</p>
    </>}
  </article>;
}