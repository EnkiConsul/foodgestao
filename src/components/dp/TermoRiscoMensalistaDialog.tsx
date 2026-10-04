import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssinaturaCaptura, salvarAssinaturaNaConta } from "@/components/dp/AssinaturaCaptura";
import { TERMO_RISCO_MENSALISTA_TITULO, termoRiscoMensalistaParagrafos } from "@/lib/dp/termos-freelancer";

interface Props {
  open: boolean;
  empresa: string;
  nome: string;
  nomeGestor: string;
  onCancel: () => void;
  onConfirm: (r: { justificativa: string; assinatura: string }) => void | Promise<void>;
}

/** Freelancer mensalista: o gestor lê, justifica e assina digitalmente a assunção do risco. */
export function TermoRiscoMensalistaDialog({ open, empresa, nome, nomeGestor, onCancel, onConfirm }: Props) {
  const [ciente, setCiente] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (open) { setCiente(false); setJustificativa(""); setSalvando(false); } }, [open]);

  const justOk = justificativa.trim().length >= 15;
  const pode = ciente && justOk && !!assinatura && !salvando;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            {TERMO_RISCO_MENSALISTA_TITULO}
          </DialogTitle>
          <DialogDescription>
            Freelancer com pagamento mensal fixo é o cenário de maior risco de reconhecimento de vínculo. Leia e assine para continuar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {termoRiscoMensalistaParagrafos({ empresa, nome }).map((p) => <p key={p}>{p}</p>)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="risco-just">Justificativa da empresa (mínimo 15 caracteres)</Label>
          <Textarea id="risco-just" rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: Prestadora pediu pagamento mensal; empresa avaliará formalização como intermitente." />
          {!justOk && justificativa.length > 0 && (
            <p className="text-xs text-destructive">Escreva pelo menos 15 caracteres explicando a decisão.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Sua assinatura eletrônica</Label>
          <AssinaturaCaptura nomePadrao={nomeGestor} onChange={setAssinatura} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(v === true)} className="mt-0.5" />
          <span>Li o termo, estou ciente dos riscos e assumo, em nome da empresa, a responsabilidade por manter este cadastro como freelancer mensalista.</span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={!pode} onClick={async () => {
            if (!assinatura) return;
            setSalvando(true);
            try { await salvarAssinaturaNaConta(assinatura); } catch { /* opcional */ }
            await onConfirm({ justificativa: justificativa.trim(), assinatura });
            setSalvando(false);
          }}>
            {salvando ? "Salvando..." : "Assinar e salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
