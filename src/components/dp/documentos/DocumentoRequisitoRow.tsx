import { useRef, useState } from "react";
import {
  Upload, Eye, Check, X, Ban, CalendarClock, FileText, ShieldCheck, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PERIODICIDADE_LABEL, STATUS_LABEL, tituloItem, type ItemChecklist, type StatusItem,
} from "@/lib/dp/documentos-requisitos";

const STATUS_STYLE: Record<StatusItem, string> = {
  pendente: "bg-muted text-muted-foreground",
  enviado: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  recusado: "bg-destructive/15 text-destructive",
  dispensado: "bg-muted text-muted-foreground",
  vencendo: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  vencido: "bg-destructive/15 text-destructive",
};

type Props = {
  item: ItemChecklist;
  /** Portal do colaborador: só envia, nunca aprova. */
  somenteEnvio?: boolean;
  ocupado?: boolean;
  onEnviar: (file: File, validade: string | null) => void;
  onAbrir: () => void;
  onAprovar?: (validade: string | null) => void;
  onRecusar?: (motivo: string) => void;
  onDispensar?: (motivo: string) => void;
  onGerar?: () => void;
};

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");

export function DocumentoRequisitoRow({
  item, somenteEnvio = false, ocupado = false,
  onEnviar, onAbrir, onAprovar, onRecusar, onDispensar, onGerar,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [validade, setValidade] = useState<string>(item.validade ?? "");
  const [recusaAberta, setRecusaAberta] = useState(false);
  const [dispensaAberta, setDispensaAberta] = useState(false);
  const [motivo, setMotivo] = useState("");

  const temArquivo = !!item.vinculo?.documento_id;
  const precisaValidade =
    item.requisito.periodicidade === "vencimento" || item.requisito.periodicidade === "anual";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        item.obrigatorio && ["pendente", "vencido", "recusado"].includes(item.status) && "border-destructive/50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{tituloItem(item)}</span>
            <Badge variant="outline" className={cn("border-0 text-xs", STATUS_STYLE[item.status])}>
              {STATUS_LABEL[item.status]}
            </Badge>
            {item.obrigatorio ? (
              <Badge variant="outline" className="text-xs">Obrigatório</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Opcional</Badge>
            )}
            {item.requisito.periodicidade !== "unica" && (
              <span className="text-xs text-muted-foreground">
                Renovação: {PERIODICIDADE_LABEL[item.requisito.periodicidade]}
              </span>
            )}
          </div>
          {item.requisito.descricao && (
            <p className="text-xs text-muted-foreground">{item.requisito.descricao}</p>
          )}
          {item.validade && (
            <p className="text-xs text-muted-foreground">
              <CalendarClock className="mr-1 inline size-3" />
              Válido até {fmt(item.validade)}
              {item.diasParaVencer !== null &&
                (item.diasParaVencer < 0
                  ? ` — vencido há ${Math.abs(item.diasParaVencer)} dia(s)`
                  : ` — em ${item.diasParaVencer} dia(s)`)}
            </p>
          )}
          {item.vinculo?.motivo_dispensa && (
            <p className="text-xs text-muted-foreground">Dispensa: {item.vinculo.motivo_dispensa}</p>
          )}
          {item.externo && (
            <p className="text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline size-3" />
              Atendido pelo registro de exames (SESMT).
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {precisaValidade && !somenteEnvio && (
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              aria-label="Validade do documento"
            />
          )}
          {item.requisito.gerado_pelo_sistema && onGerar && !somenteEnvio && (
            <Button size="sm" variant="outline" onClick={onGerar}>
              <FileText className="mr-1 size-4" /> Gerar e enviar
            </Button>
          )}
          {temArquivo && (
            <Button size="sm" variant="ghost" onClick={onAbrir}>
              <Eye className="mr-1 size-4" /> Ver
            </Button>
          )}
          {!item.externo && (
            <>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onEnviar(f, validade || null);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => inputRef.current?.click()}>
                {ocupado ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Upload className="mr-1 size-4" />}
                {temArquivo ? "Substituir" : "Anexar"}
              </Button>
            </>
          )}
          {somenteEnvio && temArquivo && item.requisito.exige_aceite && item.status === "enviado" && (
            <Button size="sm" disabled={ocupado} onClick={() => onAprovar?.(null)}>
              <Check className="mr-1 size-4" /> Li e aceito
            </Button>
          )}
          {!somenteEnvio && temArquivo && item.status !== "aprovado" && (
            <Button size="sm" onClick={() => onAprovar?.(validade || null)}>
              <Check className="mr-1 size-4" /> Aprovar
            </Button>
          )}
          {!somenteEnvio && temArquivo && (
            <Button size="sm" variant="ghost" onClick={() => setRecusaAberta(true)}>
              <X className="mr-1 size-4" /> Recusar
            </Button>
          )}
          {!somenteEnvio && !item.externo && item.status !== "dispensado" && (
            <Button size="sm" variant="ghost" onClick={() => setDispensaAberta(true)}>
              <Ban className="mr-1 size-4" /> Dispensar
            </Button>
          )}
        </div>
      </div>

      <Dialog open={recusaAberta} onOpenChange={setRecusaAberta}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar documento</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da recusa</Label>
            <Textarea value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecusaAberta(false)}>Cancelar</Button>
            <Button
              disabled={!motivo.trim()}
              onClick={() => { onRecusar?.(motivo.trim()); setRecusaAberta(false); setMotivo(""); }}
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispensaAberta} onOpenChange={setDispensaAberta}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispensar documento</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Textarea value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDispensaAberta(false)}>Cancelar</Button>
            <Button
              disabled={!motivo.trim()}
              onClick={() => { onDispensar?.(motivo.trim()); setDispensaAberta(false); setMotivo(""); }}
            >
              Dispensar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
