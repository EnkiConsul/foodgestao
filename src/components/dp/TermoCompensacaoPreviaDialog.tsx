import { useEffect, useMemo, useState } from "react";
import { Eye, Printer, Send } from "lucide-react";
import { ModoImpressaoEscolha } from "@/components/dp/documentos/ModoImpressaoEscolha";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfCanvasViewer } from "@/components/dp/PdfCanvasViewer";
import { gerarTermoCompensacaoPdf, fmtHoras, type LinhaJornada } from "@/lib/dp/termo-compensacao-pdf";
import {
  clausulasParaModo, clausulasUnificadas, emitirTermoCompensacao, tituloTermoUnificado, TERMOS_COMPENSACAO, type TermoCompensacaoTipo,
} from "@/lib/dp/termos-compensacao";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Assuntos pendentes do colaborador; mais de um permite o termo único. */
  disponiveis: TermoCompensacaoTipo[];
  companyId: string;
  colaboradorId: string;
  partes: { empresa: string; cnpj?: string | null; unidade?: string | null; nome: string; cpf?: string | null; cargo?: string | null };
  jornada: LinhaJornada[];
  onEmitido: () => void;
  /** Emite nova via arquivando a anterior. */
  substituir?: boolean;
}

/** Prévia editável do acordo antes de enviar para assinatura no portal. */
export function TermoCompensacaoPreviaDialog({ open, onOpenChange, disponiveis, companyId, colaboradorId, partes, jornada, onEmitido, substituir }: Props) {
  const [sel, setSel] = useState<TermoCompensacaoTipo[]>(disponiveis);
  const [texto, setTexto] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (open) setSel(disponiveis);
  }, [open, disponiveis.join(",")]);
  useEffect(() => {
    if (open && sel.length) setTexto(clausulasParaModo(clausulasUnificadas(sel), manual).join("\n\n"));
    setUrl(null);
  }, [open, sel.join(",")]);
  const trocarModo = (v: boolean) => {
    setManual(v);
    setTexto((t) => {
      const partes = t.split(/\n\s*\n/);
      const digital = clausulasUnificadas(sel);
      return partes.map((c) => {
        const m = c.match(/^(\d+\.\s*)Assinatura/);
        if (!m) return c;
        if (v) return clausulasParaModo([c], true)[0];
        const orig = digital.find((d) => d.startsWith(m[1]) && d.includes("Assinatura eletrônica"));
        return orig ?? c;
      }).join("\n\n");
    });
    setUrl(null);
  };
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const tipo = sel[0] ?? disponiveis[0];
  const titulo = sel.length ? tituloTermoUnificado(sel) : "";
  const total = useMemo(() => jornada.reduce((a, j) => a + (j.trabalha ? j.minutos : 0), 0), [jornada]);

  const montar = () => gerarTermoCompensacaoPdf({
    titulo, versao: "v2", ...partes, jornada, clausulas: texto.split(/\n\s*\n/), manual,
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
    if (!sel.length) { toast.error("Marque ao menos um assunto para o termo."); return; }
    if (texto.trim().length < 50) { toast.error("O texto do acordo está muito curto. Revise as cláusulas."); return; }
    setEnviando(true);
    const janela = manual ? window.open("", "_blank") : null;
    try {
      const bytes = await montar();
      const r = await emitirTermoCompensacao({ tipo, companyId, colaboradorId, titulo, bytes, integrarBanco: sel.includes("semanal") && sel.includes("banco_horas"), tipos: sel, manual });
      if (manual && r === "emitido") {
        const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (janela) janela.location.href = u; else window.open(u, "_blank");
      } else janela?.close();
      toast.success(r === "emitido"
        ? (manual ? "Termo gerado para impressão. Depois de assinado, anexe a via na aba Documentos da ficha." : "Termo enviado para assinatura no portal do colaborador.")
        : "Este termo já foi emitido.");
      onEmitido();
      onOpenChange(false);
    } catch (e: any) {
      janela?.close();
      toast.error("Não foi possível enviar o termo", { description: e?.message ?? "Tente novamente em instantes." });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Prévia do Termo</DialogTitle>
          <DialogDescription className="break-words">{titulo}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1">
            <ModoImpressaoEscolha manual={manual} onChange={trocarModo} />
            {!manual && (
              <p className="text-xs text-muted-foreground">Vai para o portal do colaborador assinar no celular. O campo do empregador sai com a chancela eletrônica da empresa — não precisa assinar.</p>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left">
                <tr><th className="p-2">Dia</th><th className="p-2">Entrada</th><th className="p-2">Intervalo</th><th className="p-2">Saída</th><th className="p-2">Horas</th></tr>
              </thead>
              <tbody>
                {jornada.map((j) => (
                  <tr key={j.dia} className="border-t border-border">
                    <td className="p-2 font-medium">{j.dia}</td>
                    {j.trabalha ? (<>
                      <td className="p-2">{j.entrada ?? "—"}</td>
                      <td className="p-2">{j.intervalo ? `${j.intervalo} min` : "—"}</td>
                      <td className="p-2">{j.saida ?? "—"}</td>
                      <td className="p-2">{j.minutos ? fmtHoras(j.minutos) : "—"}</td>
                    </>) : <td colSpan={4} className="p-2 font-semibold text-primary">{(j.descanso ?? "Folga").toUpperCase()}</td>}
                  </tr>
                ))}
                <tr className="border-t border-border font-semibold"><td className="p-2" colSpan={4}>Total Semanal</td><td className="p-2">{fmtHoras(total)}</td></tr>
              </tbody>
            </table>
          </div>
          {disponiveis.length > 1 && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
              <p className="font-medium">Assuntos do Termo Único</p>
              <p className="text-xs text-muted-foreground">O colaborador assina uma vez só. Desmarque o que deve sair em termo separado.</p>
              {disponiveis.map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <Checkbox checked={sel.includes(t)} onCheckedChange={(v) => setSel((p) => v ? [...p, t] : p.filter((x) => x !== t))} />
                  <span>{TERMOS_COMPENSACAO[t].titulo}</span>
                </label>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cláusulas (editáveis — separe cada cláusula com uma linha em branco)</Label>
            <Textarea value={texto} onChange={(e) => { setTexto(e.target.value); setUrl(null); }} rows={12} className="text-sm" />
            <p className="text-xs text-muted-foreground">Cabeçalho da empresa, partes, quadro da jornada e campos de assinatura são incluídos automaticamente no PDF.</p>
          </div>
          {url && <div className="h-[60vh] rounded-lg border border-border"><PdfCanvasViewer url={url} title={titulo} /></div>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={visualizar}><Eye className="mr-1.5 h-4 w-4" />Visualizar PDF</Button>
          <Button type="button" disabled={enviando} onClick={enviar}>{manual ? <Printer className="mr-1.5 h-4 w-4" /> : <Send className="mr-1.5 h-4 w-4" />}{enviando ? "Gerando..." : manual ? "Gerar para Imprimir" : "Enviar para Assinatura"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
