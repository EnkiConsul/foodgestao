import { useEffect, useState } from "react";
import { Eye, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfCanvasViewer } from "@/components/dp/PdfCanvasViewer";
import { ModoImpressaoEscolha } from "@/components/dp/documentos/ModoImpressaoEscolha";
import { gerarTermoCompensacaoPdf } from "@/lib/dp/termo-compensacao-pdf";
import {
  TERMO_TERCEIRO_TITULO, TERMO_TERCEIRO_VERSAO, clausulasTermoTerceiro, destinoTexto, emitirTermoTerceiro,
} from "@/lib/dp/termo-conta-terceiro";
import type { DadosPagamento } from "@/lib/dp/dadosPagamento";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  colaboradorId: string;
  partes: { empresa: string; cnpj?: string | null; unidade?: string | null; nome: string; cpf?: string | null; cargo?: string | null };
  pagamento: DadosPagamento;
  onEmitido: () => void;
}

/** Prévia do termo de conta/Pix de terceiro, no mesmo padrão dos demais termos. */
export function TermoContaTerceiroPreviaDialog({ open, onOpenChange, companyId, colaboradorId, partes, pagamento, onEmitido }: Props) {
  const [manual, setManual] = useState(false);
  const [texto, setTexto] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const gerarTexto = (m: boolean) => clausulasTermoTerceiro({
    empresa: partes.empresa, nome: partes.nome,
    titularNome: pagamento.titular_nome.toUpperCase(), titularCpf: pagamento.titular_cpf,
    relacao: pagamento.titular_relacao.toUpperCase(), destino: destinoTexto(pagamento),
  }, m).join("\n\n");

  useEffect(() => { if (open) { setManual(false); setTexto(gerarTexto(false)); setUrl(null); } }, [open]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const trocarModo = (v: boolean) => { setManual(v); setTexto(gerarTexto(v)); setUrl(null); };
  const montar = () => gerarTermoCompensacaoPdf({
    titulo: TERMO_TERCEIRO_TITULO, versao: TERMO_TERCEIRO_VERSAO, ...partes, jornada: [], clausulas: texto.split(/\n\s*\n/), manual,
  });

  const visualizar = async () => {
    try {
      const bytes = await montar();
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })));
    } catch (e: any) {
      toast.error("Não foi possível montar a prévia", { description: e?.message ?? "Revise o texto e tente de novo." });
    }
  };

  const enviar = async () => {
    if (texto.trim().length < 50) { toast.error("O texto do termo está muito curto. Revise as cláusulas."); return; }
    setEnviando(true);
    const janela = manual ? window.open("", "_blank") : null;
    try {
      const bytes = await montar();
      await emitirTermoTerceiro({ companyId, colaboradorId, bytes, manual });
      if (manual) {
        const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (janela) janela.location.href = u; else window.open(u, "_blank");
      }
      toast.success(manual
        ? "Termo gerado para impressão. Depois de assinado, anexe a via na aba Documentos da ficha."
        : "Termo enviado para assinatura no portal do colaborador.");
      onEmitido();
    } catch (e: any) {
      janela?.close();
      toast.error("Não foi possível emitir o termo", { description: e?.message ?? "Tente novamente em instantes." });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Prévia do Termo</DialogTitle>
          <DialogDescription className="break-words">{TERMO_TERCEIRO_TITULO}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            Os dados de pagamento foram salvos. Pela CLT (art. 464), o pagamento em conta de outra pessoa precisa
            da autorização escrita do colaborador — emita o termo agora.
          </p>
          <ModoImpressaoEscolha manual={manual} onChange={trocarModo} />
          {!manual && (
            <p className="text-xs text-muted-foreground">Vai para o portal do colaborador assinar no celular. O campo do empregador sai com a chancela eletrônica da empresa.</p>
          )}
          <div className="space-y-1.5">
            <Label>Cláusulas (editáveis — separe cada cláusula com uma linha em branco)</Label>
            <Textarea value={texto} onChange={(e) => { setTexto(e.target.value); setUrl(null); }} rows={12} className="text-sm" />
            <p className="text-xs text-muted-foreground">Cabeçalho da empresa, partes e campos de assinatura são incluídos automaticamente no PDF.</p>
          </div>
          {url && <div className="h-[60vh] rounded-lg border border-border"><PdfCanvasViewer url={url} title={TERMO_TERCEIRO_TITULO} /></div>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Emitir Depois</Button>
          <Button type="button" variant="outline" onClick={visualizar}><Eye className="mr-1.5 h-4 w-4" />Visualizar PDF</Button>
          <Button type="button" disabled={enviando} onClick={enviar}>{manual ? <Printer className="mr-1.5 h-4 w-4" /> : <Send className="mr-1.5 h-4 w-4" />}{enviando ? "Gerando..." : manual ? "Gerar para Imprimir" : "Enviar para Assinatura"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
