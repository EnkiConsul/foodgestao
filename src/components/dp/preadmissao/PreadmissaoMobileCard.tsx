import { CalendarClock, Copy, Eye, MessageCircle, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DpActionsMenu } from "@/components/dp/DpActions";
import { PREADMISSAO_STATUS_LABEL, type PreadmissaoResumo } from "@/hooks/dp/useDpPreadmissoes";
import { maskPhone } from "@/lib/phone";

const PROXIMA_ACAO: Record<string, string> = {
  aguardando_preenchimento: "Aguardando os dados e documentos do candidato",
  em_preenchimento: "O candidato começou a preencher a ficha",
  correcao_solicitada: "O candidato precisa corrigir a ficha",
  aguardando_nova_versao: "Aguardando a nova versão dos documentos",
  aguardando_revisao: "Ficha enviada: confira os dados e documentos",
  pronto_contabilidade: "Confira o registro ou siga para a efetivação",
  enviado_contabilidade: "Aguardando a ficha de registro",
  aguardando_retorno_contabilidade: "Aguardando a ficha de registro",
  registro_recebido: "Registro recebido: confira e efetive a admissão",
  concluido: "Cadastro do colaborador disponível",
  expirado: "Prorrogue o prazo para o candidato continuar",
  cancelado: "O acesso do candidato foi cancelado",
};

interface Props {
  ficha: PreadmissaoResumo;
  cargo: string;
  unidade: string;
  prorrogando: boolean;
  onRevisar: () => void;
  onMensagem: () => void;
  onNovoLink: () => void;
  onProrrogar: () => void;
  onCancelar: () => void;
  onExcluir: () => void;
}

export function PreadmissaoMobileCard({ ficha: p, cargo, unidade, prorrogando, onRevisar, onMensagem, onNovoLink, onProrrogar, onCancelar, onExcluir }: Props) {
  const ativa = !p.colaborador_id && !["concluido", "cancelado"].includes(p.status);
  const expira = p.convite_expira_em ? new Date(p.convite_expira_em) : null;
  const vencido = ativa && (p.status === "expirado" || (expira && expira.getTime() <= Date.now()));
  const vencendo = ativa && !vencido && expira && expira.getTime() - Date.now() <= 48 * 60 * 60 * 1000;
  const telefone = p.whatsapp.replace(/^\+?55(?=\d{10,11}$)/, "");
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-2">
          <h3 className="break-words text-sm font-semibold leading-snug">{p.candidato_nome}</h3>
          <Badge variant="outline" className="max-w-full whitespace-normal text-left text-[11px] leading-snug">{PREADMISSAO_STATUS_LABEL[p.status]}</Badge>
        </div>
        <DpActionsMenu vertical className="min-h-11 min-w-11 shrink-0" actions={[
          { key: "link", label: "Gerar e copiar novo link", icon: Copy, hidden: !ativa, onSelect: onNovoLink },
          { key: "cancelar", label: "Cancelar link", icon: Ban, hidden: !ativa, destructive: true, onSelect: onCancelar },
          { key: "excluir", label: "Excluir ficha", icon: Trash2, destructive: true, disabled: p.status === "concluido" || !!p.colaborador_id, onSelect: onExcluir },
        ]} />
      </div>
      <p className="mt-2 break-words text-xs text-muted-foreground">{cargo} · {unidade}</p>
      <p className="mt-3 text-sm leading-snug">{PROXIMA_ACAO[p.status]}</p>
      {ativa && <p className={`mt-2 flex items-start gap-1.5 text-xs ${vencido ? "text-destructive" : vencendo ? "text-warning-foreground" : "text-muted-foreground"}`}>
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        {vencido ? "Link vencido" : vencendo ? "Link vence em breve" : "Link válido"}{expira ? ` · ${expira.toLocaleDateString("pt-BR")}` : ""}
      </p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" className="min-h-11 flex-1" onClick={onRevisar}><Eye className="mr-1.5 h-4 w-4" />{p.status === "concluido" ? "Abrir cadastro" : "Revisar"}</Button>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={onMensagem} disabled={!p.whatsapp} title="Enviar WhatsApp" aria-label={`Enviar WhatsApp para ${p.candidato_nome}`}><MessageCircle className="h-4 w-4" /></Button>
        {ativa && <Button variant="outline" className="min-h-11" disabled={prorrogando} onClick={onProrrogar} title="Renovar validade até 7 dias a partir de hoje"><CalendarClock className="mr-1.5 h-4 w-4" />7 dias</Button>}
      </div>
      {p.whatsapp && <p className="mt-2 text-xs text-muted-foreground">{maskPhone(telefone)}</p>}
    </article>
  );
}