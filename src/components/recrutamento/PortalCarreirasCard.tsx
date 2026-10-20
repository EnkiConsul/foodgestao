import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Share2, Pencil, Copy, Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { urlPortal } from "@/lib/recrutamento/portal";

interface Portal { company_id: string; slug: string; nome_publico: string | null; apresentacao: string | null; regiao: string | null }

export function PortalCarreirasCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<"compartilhar" | "editar" | null>(null);
  const q = useQuery({
    queryKey: ["rec-portal", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recrutamento_portais")
        .select("company_id,slug,nome_publico,apresentacao,regiao").eq("company_id", companyId).maybeSingle();
      if (error) throw error;
      return data as Portal | null;
    },
  });
  if (!q.data) return null;
  const p = q.data;
  const url = urlPortal(p.slug);
  return (
    <Card className="border-primary/40">
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Portal de Carreiras</h2>
          <p className="text-xs text-muted-foreground">Link permanente da empresa, com as vagas abertas e o Banco de Talentos. Funciona mesmo sem vagas.</p>
        </div>
        <p className="text-sm break-all font-medium">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAberto("compartilhar")}><Share2 className="h-4 w-4 mr-1" />Compartilhar</Button>
          <Button size="sm" variant="outline" onClick={() => setAberto("editar")}><Pencil className="h-4 w-4 mr-1" />Editar apresentação</Button>
          <Button size="sm" variant="outline" asChild><a href={`/carreiras/${p.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Abrir</a></Button>
        </div>
      </CardContent>
      {aberto === "compartilhar" && (
        <CompartilharDialog url={url} arquivo={`portal-${p.slug}.png`} onClose={() => setAberto(null)}
          texto={`Trabalhe na ${p.nome_publico ?? "nossa empresa"}! Veja as vagas e cadastre seu perfil:`} />
      )}
      {aberto === "editar" && (
        <PortalForm portal={p} onClose={() => setAberto(null)}
          onSaved={() => { setAberto(null); qc.invalidateQueries({ queryKey: ["rec-portal", companyId] }); }} />
      )}
    </Card>
  );
}

function PortalForm({ portal, onClose, onSaved }: { portal: Portal; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(portal);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from("recrutamento_portais").update({
      nome_publico: f.nome_publico?.trim() || null, apresentacao: f.apresentacao?.trim() || null, regiao: f.regiao?.trim() || null,
    }).eq("company_id", portal.company_id);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Portal atualizado"); onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Apresentação do Portal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="pn">Nome exibido</Label><Input id="pn" maxLength={80} value={f.nome_publico ?? ""} onChange={(e) => setF({ ...f, nome_publico: e.target.value })} /></div>
          <div><Label htmlFor="pr">Cidade ou região</Label><Input id="pr" maxLength={80} value={f.regiao ?? ""} onChange={(e) => setF({ ...f, regiao: e.target.value })} /></div>
          <div><Label htmlFor="pa">Breve apresentação</Label><Textarea id="pa" rows={4} maxLength={600} value={f.apresentacao ?? ""} onChange={(e) => setF({ ...f, apresentacao: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">O link do portal é permanente e não muda.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompartilharDialog({ url, texto, arquivo, onClose }: { url: string; texto: string; arquivo: string; onClose: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQr).catch(() => setQr("")); }, [url]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Compartilhar Portal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {qr && <img src={qr} alt="QR Code do portal" className="w-56 h-56 mx-auto" />}
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))}><Copy className="h-4 w-4 mr-1" />Copiar</Button>
            <Button variant="outline" asChild><a href={qr} download={arquivo}><Download className="h-4 w-4 mr-1" />QR Code</a></Button>
            <Button variant="outline" asChild className="col-span-2"><a href={`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`} target="_blank" rel="noopener noreferrer">Compartilhar no WhatsApp</a></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
