import { useRef, useState } from "react";
import {
  Upload, Eye, Check, X, Ban, CalendarClock, Loader2, Trash2, PenLine, FileText,
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
  PERIODICIDADE_LABEL, STATUS_LABEL, tituloItem,
  type DpColaboradorDocumento, type ItemChecklist, type StatusItem,
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

type Anexo = DpColaboradorDocumento & { dp_documentos?: any };

type Props = {
  item: ItemChecklist;
  /** Portal do colaborador: só envia e aceita, nunca aprova. */
  somenteEnvio?: boolean;
  ocupado?: boolean;
  onEnviar: (file: File, validade: string | null) => void;
  onAbrir: (anexo: Anexo) => void;
  onAprovar?: (anexo: Anexo, validade: string | null) => void;
  onRecusar?: (anexo: Anexo, motivo: string) => void;
  onDispensar?: (motivo: string) => void;
  onExcluir?: (anexo: Anexo) => void;
  onPedirAceite?: (anexo: Anexo) => void;
  onAceitar?: (anexo: Anexo) => void;
};

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
const dtHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export function DocumentoRequisitoRow({
  item, somenteEnvio = false, ocupado = false,
  onEnviar, onAbrir, onAprovar, onRecusar, onDispensar, onExcluir, onPedirAceite, onAceitar,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [validade, setValidade] = useState<string>(item.validade ?? "");
  const [recusaAlvo, setRecusaAlvo] = useState<Anexo | null>(null);
  const [dispensaAberta, setDispensaAberta] = useState(false);
  const [motivo, setMotivo] = useState("");

  const anexos = (item.anexos ?? []).filter((a) => !!a.documento_id) as Anexo[];
  const temArquivo = anexos.length > 0;
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
            {item.multiplos && (
              <Badge variant="secondary" className="text-xs">Vários arquivos</Badge>
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
            {item.multiplos ? "Adicionar arquivo" : temArquivo ? "Substituir" : "Anexar"}
          </Button>
          {!somenteEnvio && item.status !== "dispensado" && (
            <Button size="sm" variant="ghost" onClick={() => setDispensaAberta(true)}>
              <Ban className="mr-1 size-4" /> Dispensar
            </Button>
          )}
        </div>
      </div>

      {temArquivo && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {anexos.map((anexo) => {
            const doc = anexo.dp_documentos;
            const aguardaAceite = !!anexo.aceite_solicitado_em && !anexo.aceito_em;
            return (
              <li key={anexo.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1 truncate text-sm">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    {doc?.file_name ?? "Arquivo"}
                    <Badge
                      variant="outline"
                      className={cn("border-0 text-[10px]", STATUS_STYLE[(anexo.status ?? "enviado") as StatusItem])}
                    >
                      {STATUS_LABEL[(anexo.status ?? "enviado") as StatusItem]}
                    </Badge>
                  </p>
                  {anexo.aceito_em ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Aceito pelo colaborador em {dtHora(anexo.aceito_em)}
                    </p>
                  ) : aguardaAceite ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Aguardando aceite do colaborador desde {dtHora(anexo.aceite_solicitado_em!)}
                    </p>
                  ) : null}
                  {doc?.motivo_recusao && (
                    <p className="text-xs text-destructive">Recusa: {doc.motivo_recusao}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onAbrir(anexo)}>
                    <Eye className="mr-1 size-4" /> Ver
                  </Button>
                  {somenteEnvio && aguardaAceite && (
                    <Button size="sm" disabled={ocupado} onClick={() => onAceitar?.(anexo)}>
                      <Check className="mr-1 size-4" /> Li e aceito
                    </Button>
                  )}
                  {!somenteEnvio && (
                    <>
                      {anexo.status !== "aprovado" && (
                        <Button size="sm" onClick={() => onAprovar?.(anexo, validade || null)}>
                          <Check className="mr-1 size-4" /> Aprovar
                        </Button>
                      )}
                      {anexo.status !== "recusado" && (
                        <Button size="sm" variant="ghost" onClick={() => setRecusaAlvo(anexo)}>
                          <X className="mr-1 size-4" /> Recusar
                        </Button>
                      )}
                      {onPedirAceite && !anexo.aceito_em && !aguardaAceite && (
                        <Button size="sm" variant="ghost" onClick={() => onPedirAceite(anexo)}>
                          <PenLine className="mr-1 size-4" /> Enviar para aceite
                        </Button>
                      )}
                      {onExcluir && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => onExcluir(anexo)}
                          aria-label="Remover anexo"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!recusaAlvo} onOpenChange={(o) => !o && setRecusaAlvo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar documento</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da recusa</Label>
            <Textarea value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecusaAlvo(null)}>Cancelar</Button>
            <Button
              disabled={!motivo.trim()}
              onClick={() => {
                if (recusaAlvo) onRecusar?.(recusaAlvo, motivo.trim());
                setRecusaAlvo(null);
                setMotivo("");
              }}
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
