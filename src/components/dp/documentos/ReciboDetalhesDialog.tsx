import { ViaAssinadaBotao } from "./ViaAssinadaBotao";
import { useEffect, useState } from "react";
import { Copy, Download, Eye, Pencil, EyeOff, FileCheck2, Link2, Loader2, MessageCircle, Receipt, XCircle } from "lucide-react";
import { PdfCanvasViewer } from "@/components/dp/PdfCanvasViewer";
import { Button } from "@/components/ui/button";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { DpStatusBadge } from "@/components/dp/DpStatusBadge";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import { centsParaBRL, MODALIDADE_LABEL } from "@/lib/dp/comprovante-quitacao";
import { NATUREZA_RECIBO_LABEL, reciboPdfUrl, statusRecibo, type NaturezaRecibo } from "@/lib/dp/recibos";

export type ReciboDetalhado = {
  id: string;
  colaborador_id: string | null;
  documento_id: string | null;
  beneficiario_nome: string;
  beneficiario_cpf: string | null;
  beneficiario_whatsapp: string | null;
  natureza: string;
  descricao: string | null;
  competencia: string;
  pago_em: string;
  valor_cents: number;
  modalidade: "bancario" | "especie" | "misto";
  valor_bancario_cents: number | null;
  valor_especie_cents: number | null;
  canal_assinatura: string;
  link_expira_em: string | null;
  link_enviado_em: string | null;
  assinado_em: string | null;
  assinado_ip: string | null;
  assinado_user_agent: string | null;
  cancelado_em: string | null;
  substituido_em?: string | null;
  substitui_recibo_id?: string | null;
  created_at: string;
  unidade_id?: string | null;
  /** Via assinada à mão já importada no documento vinculado. */
  via_assinada_path?: string | null;
};

const dataBR = (v?: string | null, hora = false) => {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", hora ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" });
};
const canalLabel: Record<string, string> = { portal: "Portal do Colaborador", whatsapp: "Link pelo WhatsApp", fisico: "Assinatura à Mão" };

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{children || "—"}</dd></div>;
}

export function ReciboDetalhesDialog({
  recibo,
  onOpenChange,
  onPdf,
  onWhatsApp,
  onCopiarLink,
  onCertificado,
  onCancelar,
  onEditar,
  onNovaVia,
  companyId = null,
  onViaAnexada,
}: {
  recibo: ReciboDetalhado | null;
  onOpenChange: (open: boolean) => void;
  onPdf: (recibo: ReciboDetalhado) => void;
  onWhatsApp: (recibo: ReciboDetalhado) => void;
  onCopiarLink: (recibo: ReciboDetalhado) => void;
  onCertificado: (recibo: ReciboDetalhado) => void;
  onCancelar: (recibo: ReciboDetalhado) => void;
  onEditar: (recibo: ReciboDetalhado) => void;
  onNovaVia: (recibo: ReciboDetalhado) => void;
  companyId?: string | null;
  onViaAnexada?: () => void;
  /** Cria um recibo novo e independente aproveitando os dados deste. */
  onDuplicar?: (recibo: ReciboDetalhado) => void;
}) {
  const [avisoAssinado, setAvisoAssinado] = useState(false);
  const [verPdf, setVerPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [carregandoPdf, setCarregandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const reciboId = recibo?.id;
  const assinadoEm = recibo?.assinado_em;

  // Troca de recibo (ou assinatura nova): descarta a prévia anterior.
  useEffect(() => {
    setVerPdf(false);
    setErroPdf(null);
    setPdfUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setAvisoAssinado(false);
  }, [reciboId, assinadoEm]);

  useEffect(() => {
    if (!verPdf || pdfUrl || !reciboId) return;
    let vivo = true;
    setCarregandoPdf(true);
    reciboPdfUrl(reciboId)
      .then((u) => { if (vivo) setPdfUrl(u); else URL.revokeObjectURL(u); })
      .catch((e) => vivo && setErroPdf((e as Error).message))
      .finally(() => vivo && setCarregandoPdf(false));
    return () => { vivo = false; };
  }, [verPdf, pdfUrl, reciboId]);

  if (!recibo) return null;
  const status = statusRecibo(recibo);
  const fisico = recibo.canal_assinatura === "fisico";
  const temVia = !!recibo.via_assinada_path;
  const pendente = !recibo.assinado_em && !recibo.cancelado_em;
  // Editável só enquanto não houver assinatura digital nem via física importada.
  const aberto = pendente && !temVia;
  const travado = !recibo.cancelado_em && !recibo.substituido_em && (!!recibo.assinado_em || temVia);
  const avulso = !recibo.colaborador_id;
  const tone = recibo.cancelado_em ? "danger" : recibo.assinado_em ? "success" : "warning";

  return (
    <DpDialogShell
      open
      onOpenChange={onOpenChange}
      icon={Receipt}
      title={recibo.beneficiario_nome}
      description={`${NATUREZA_RECIBO_LABEL[recibo.natureza as NaturezaRecibo] ?? recibo.natureza} · ${recibo.competencia.slice(5, 7)}/${recibo.competencia.slice(0, 4)}`}
      size="lg"
      footer={<Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <DpStatusBadge tone={tone}>{status.label}</DpStatusBadge>
          <DpStatusBadge tone="muted">{canalLabel[recibo.canal_assinatura] ?? recibo.canal_assinatura}</DpStatusBadge>
          {fisico && !recibo.cancelado_em && !recibo.assinado_em && (
            <DpStatusBadge tone={temVia ? "success" : "warning"}>{temVia ? "Via Assinada Importada" : "Falta Via Assinada"}</DpStatusBadge>
          )}
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <Campo label="Beneficiário">{recibo.beneficiario_nome}</Campo>
          <Campo label="CPF">{recibo.beneficiario_cpf ? `•••.•••.•••-${recibo.beneficiario_cpf.replace(/\D/g, "").slice(-2)}` : "—"}</Campo>
          <Campo label="Natureza">{NATUREZA_RECIBO_LABEL[recibo.natureza as NaturezaRecibo] ?? recibo.natureza}</Campo>
          <Campo label="Competência">{recibo.competencia.slice(5, 7)}/{recibo.competencia.slice(0, 4)}</Campo>
          <Campo label="Valor Total">{centsParaBRL(recibo.valor_cents)}</Campo>
          <Campo label="Data do Pagamento">{dataBR(recibo.pago_em)}</Campo>
          <Campo label="Forma de Pagamento">{MODALIDADE_LABEL[recibo.modalidade]}</Campo>
          {recibo.modalidade === "misto" && <Campo label="Divisão do Pagamento">Conta: {centsParaBRL(recibo.valor_bancario_cents ?? 0)} · Dinheiro: {centsParaBRL(recibo.valor_especie_cents ?? 0)}</Campo>}
          <Campo label="Emitido em">{dataBR(recibo.created_at, true)}</Campo>
          <Campo label="Assinado em">{dataBR(recibo.assinado_em, true)}</Campo>
          {recibo.link_enviado_em && <Campo label="Link Enviado em">{dataBR(recibo.link_enviado_em, true)}</Campo>}
          {recibo.link_expira_em && !recibo.assinado_em && <Campo label="Link Expira em">{dataBR(recibo.link_expira_em, true)}</Campo>}
          {recibo.assinado_ip && <Campo label="Endereço IP">{recibo.assinado_ip}</Campo>}
          {recibo.assinado_user_agent && <Campo label="Dispositivo / Navegador">{recibo.assinado_user_agent}</Campo>}
        </dl>

        {recibo.descricao && <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs font-medium text-muted-foreground">Descrição</p><p className="mt-1 text-sm">{recibo.descricao}</p></div>}

        {verPdf && (
          <div className="h-[75vh] sm:h-[60vh] overflow-hidden rounded-md border bg-muted/30">
            {carregandoPdf && <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
            {erroPdf && <p className="p-4 text-sm text-destructive">{erroPdf}</p>}
            {pdfUrl && <PdfCanvasViewer url={pdfUrl} title={`Recibo de ${recibo.beneficiario_nome}`} />}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => setVerPdf((v) => !v)}>
            {verPdf ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {verPdf ? "Ocultar Recibo" : "Visualizar Recibo"}
          </Button>
          <Button variant="outline" onClick={() => onPdf(recibo)}><Download className="mr-1.5 h-4 w-4" />Baixar PDF</Button>
          {avulso && aberto && recibo.canal_assinatura === "whatsapp" && <Button onClick={() => onWhatsApp(recibo)}><MessageCircle className="mr-1.5 h-4 w-4" />Enviar pelo WhatsApp</Button>}
          {avulso && aberto && recibo.canal_assinatura === "whatsapp" && <Button variant="outline" onClick={() => onCopiarLink(recibo)}><Link2 className="mr-1.5 h-4 w-4" />Copiar Link</Button>}
          {!avulso && recibo.assinado_em && recibo.documento_id && <Button variant="outline" onClick={() => onCertificado(recibo)}><FileCheck2 className="mr-1.5 h-4 w-4" />Abrir Certificado</Button>}
          {aberto && <Button variant="outline" onClick={() => onEditar(recibo)}><Pencil className="mr-1.5 h-4 w-4" />Editar Recibo</Button>}
          {fisico && pendente && recibo.documento_id && (
            <ViaAssinadaBotao documentoId={recibo.documento_id} companyId={companyId} colaboradorId={recibo.colaborador_id} temVia={temVia} rotulo className="border" onDone={onViaAnexada} />
          )}
          {travado && <Button variant="outline" onClick={() => setAvisoAssinado(true)}><Pencil className="mr-1.5 h-4 w-4" />Editar Recibo</Button>}
          {onDuplicar && <Button variant="outline" onClick={() => onDuplicar(recibo)}><Copy className="mr-1.5 h-4 w-4" />Criar a Partir Deste</Button>}
          {aberto && <ConfirmarAcaoDialog titulo="Cancelar Recibo" descricao="O recibo será cancelado, o documento vinculado será arquivado e a pendência poderá ser reaberta." confirmar="Cancelar Recibo" onConfirm={() => onCancelar(recibo)}><Button variant="outline" className="text-destructive"><XCircle className="mr-1.5 h-4 w-4" />Cancelar</Button></ConfirmarAcaoDialog>}
        </div>
        {avisoAssinado && (
          <div role="alert" className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-3 text-sm">
            <p>{recibo.assinado_em ? `Este recibo já foi assinado em ${dataBR(recibo.assinado_em, true)}` : "A via assinada à mão deste recibo já foi importada"} e não pode ter o conteúdo alterado, para manter a validade jurídica do documento.</p>
            <p>Você pode emitir uma nova via corrigida a partir dele: os dados vêm preenchidos e o original fica marcado como substituído no histórico.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onNovaVia(recibo)}><Copy className="mr-1.5 h-4 w-4" />Emitir Nova Via Corrigida</Button>
              <Button variant="outline" onClick={() => setAvisoAssinado(false)}>Voltar</Button>
            </div>
          </div>
        )}
        {recibo.substituido_em && <p className="text-sm text-muted-foreground">Substituído por nova via corrigida em {dataBR(recibo.substituido_em, true)}.</p>}
        {recibo.substitui_recibo_id && <p className="text-sm text-muted-foreground">Esta é uma nova via corrigida de um recibo anterior.</p>}
      </div>
    </DpDialogShell>
  );
}