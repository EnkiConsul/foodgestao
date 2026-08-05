import { useState } from "react";
import { AlertTriangle, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { STATION_LABELS } from "@/lib/orders/kitchen";
import { MAX_PRINT_COPIES, PRINT_JOB_STATUS_LABELS } from "@/lib/orders/print";
import type { PrintJob } from "@/hooks/useOrdersKitchen";

interface Props {
  jobs: PrintJob[];
  isLoading?: boolean;
  readOnly?: boolean;
  copies: number;
  onCopiesChange: (value: number) => void;
  autoPrint: boolean;
  onAutoPrintChange: (value: boolean) => void;
  printerName: string;
  onPrinterNameChange: (value: string) => void;
  connectorName: string | null;
  onRetry: (job: PrintJob) => void;
  onReprint: (job: PrintJob, reason: string) => void;
  onRefresh: () => void;
  isBusy?: boolean;
}

export function PrintQueuePanel({
  jobs,
  isLoading,
  readOnly,
  copies,
  onCopiesChange,
  autoPrint,
  onAutoPrintChange,
  printerName,
  onPrinterNameChange,
  connectorName,
  onRetry,
  onReprint,
  onRefresh,
  isBusy,
}: Props) {
  const [reprintTarget, setReprintTarget] = useState<PrintJob | null>(null);
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Printer className="h-4 w-4" aria-hidden="true" /> Fila de impressão
        </CardTitle>
        <Button
          variant="outline"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label="Atualizar fila de impressão"
          onClick={onRefresh}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="print-copies" className="text-xs">
              Vias por comanda
            </Label>
            <Select value={String(copies)} onValueChange={(v) => onCopiesChange(Number(v))}>
              <SelectTrigger id="print-copies" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_PRINT_COPIES }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} via{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="printer-name" className="text-xs">
              Impressora (opcional)
            </Label>
            <Input
              id="printer-name"
              className="min-h-11"
              value={printerName}
              maxLength={120}
              placeholder="Ex.: Cozinha-01"
              onChange={(e) => onPrinterNameChange(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Switch id="auto-print" checked={autoPrint} onCheckedChange={onAutoPrintChange} disabled={readOnly} />
            <Label htmlFor="auto-print" className="pb-2 text-xs">
              Impressão automática de novos pedidos
            </Label>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {connectorName
            ? `Conector local detectado: ${connectorName}.`
            : "Sem conector local — as comandas são impressas pelo navegador (libere pop-ups)."}
        </p>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando fila…</p>
          ) : jobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma comanda impressa nesta sessão.</p>
          ) : (
            <ul className="divide-y">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                  <Badge variant="outline">{STATION_LABELS[job.station]}</Badge>
                  <span className="font-medium">
                    {job.copies} via{job.copies > 1 ? "s" : ""}
                  </span>
                  <Badge
                    variant={
                      job.status === "failed"
                        ? "destructive"
                        : job.status === "printed"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {PRINT_JOB_STATUS_LABELS[job.status]}
                  </Badge>
                  {job.is_reprint && <Badge variant="outline">Reimpressão</Badge>}
                  <span className="text-muted-foreground">
                    {new Date(job.created_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {job.attempts > 1 ? ` · ${job.attempts} tentativas` : ""}
                  </span>
                  {job.last_error && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {job.last_error}
                    </span>
                  )}
                  {!readOnly && (
                    <span className="ml-auto flex gap-2">
                      {job.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          disabled={isBusy}
                          onClick={() => onRetry(job)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Tentar novamente
                        </Button>
                      )}
                      <Dialog
                        open={reprintTarget?.id === job.id}
                        onOpenChange={(open) => {
                          setReprintTarget(open ? job : null);
                          if (!open) setReason("");
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="min-h-11">
                            Reimprimir
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Reimprimir comanda</DialogTitle>
                            <DialogDescription>
                              A reimpressão é registrada com o solicitante e o motivo informado.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2">
                            <Label htmlFor={`reprint-reason-${job.id}`} className="text-xs">
                              Motivo da reimpressão
                            </Label>
                            <Textarea
                              id={`reprint-reason-${job.id}`}
                              value={reason}
                              maxLength={300}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Ex.: comanda rasgada, impressora travou…"
                            />
                          </div>
                          <DialogFooter>
                            <Button
                              className="min-h-11"
                              disabled={reason.trim().length < 3 || isBusy}
                              onClick={() => {
                                onReprint(job, reason.trim());
                                setReprintTarget(null);
                                setReason("");
                              }}
                            >
                              Confirmar reimpressão
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
