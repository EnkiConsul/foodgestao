import { useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Importa uma ata feita fora do sistema: para assinatura ou já assinada no papel. */
export function AtaImportarDialog({ companyId, onClose, onCriada }: { companyId: string; onClose: () => void; onCriada: (ata: unknown) => void }) {
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(hoje());
  const [modo, setModo] = useState<"importada" | "importada_assinada">("importada");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    if (titulo.trim().length < 3) return toast.error("Informe o título da reunião (mínimo 3 caracteres).");
    if (!arquivo) return toast.error("Escolha o PDF da ata.");
    if (arquivo.type !== "application/pdf") return toast.error("Envie a ata em PDF.", { description: "Se estiver em Word, salve como PDF antes." });
    if (arquivo.size > 15 * 1024 * 1024) return toast.error("O PDF passa de 15 MB.", { description: "Reduza o arquivo e tente de novo." });
    setSalvando(true);
    try {
      const path = `${companyId}/atas/${crypto.randomUUID()}-${arquivo.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await supabase.storage.from("dp-documentos").upload(path, arquivo, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const conteudo = modo === "importada_assinada"
        ? "<p>Ata realizada fora do sistema e assinada no papel. Via original digitalizada em anexo.</p>"
        : "<p>Ata realizada fora do sistema. Documento original em anexo para assinatura.</p>";
      const { data: ins, error } = await supabase.from("dp_atas" as never).insert({
        company_id: companyId, titulo: titulo.trim(), data_reuniao: data, conteudo_html: conteudo, origem: modo,
        anexos: [{ path, name: arquivo.name, mime: "application/pdf", size: arquivo.size }],
      } as never).select("*").single();
      if (error) throw error;
      toast.success("Ata importada.", { description: "Agora adicione os participantes e envie." });
      onCriada(ins);
    } catch (e: any) {
      toast.error("Não foi possível importar a ata.", { description: /permission|policy/i.test(e?.message ?? "") ? "Seu perfil não tem permissão em Documentos. Fale com o administrador." : "Tente novamente em instantes." });
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-primary" />Importar Ata</DialogTitle>
          <DialogDescription>Para atas feitas no Word, à mão ou em outro sistema.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Título da Reunião *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div className="space-y-1"><Label>Data *</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="space-y-1"><Label>PDF da Ata *</Label><Input type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /></div>
          <RadioGroup value={modo} onValueChange={(v) => setModo(v as typeof modo)} className="space-y-2">
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm"><RadioGroupItem value="importada" className="mt-0.5" />
              <span><span className="font-medium">Enviar para Assinatura</span><span className="block text-xs text-muted-foreground">Os participantes assinam pelo portal ou pelo link no WhatsApp.</span></span></label>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm"><RadioGroupItem value="importada_assinada" className="mt-0.5" />
              <span><span className="font-medium">Já Assinada no Papel</span><span className="block text-xs text-muted-foreground">Arquiva a via digitalizada no dossiê de cada participante, sem pedir nova assinatura.</span></span></label>
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando} onClick={criar}>{salvando ? "Importando…" : "Continuar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
