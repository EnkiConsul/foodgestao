import { useEffect, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  createErrorReport,
  reportError,
  setErrorReportCompany,
  type ErrorReportReadyDetail,
} from "@/lib/errorLog";

const ERRO_RELATORIO_TOAST_ID = "erro-relatorio";

export function ErrorReportCenter() {
  const { selectedCompanyId } = useCompanyContext();
  const [pending, setPending] = useState<ErrorReportReadyDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [attemptedAction, setAttemptedAction] = useState("");
  const [sending, setSending] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);

  useEffect(() => setErrorReportCompany(selectedCompanyId), [selectedCompanyId]);

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<ErrorReportReadyDetail>).detail;
      if (!detail?.errorLogId) return;
      setPending(detail);
      setProtocol(null);
      toast.error("Encontramos um problema", {
        id: ERRO_RELATORIO_TOAST_ID,
        closeButton: true,
        description: "Ajude-nos a corrigir: conte o que aconteceu. Se preferir, feche este aviso no X.",
        duration: 20_000,
        action: {
          label: "Relatar problema",
          onClick: () => {
            toast.dismiss(ERRO_RELATORIO_TOAST_ID);
            setOpen(true);
          },
        },
      });
    };
    window.addEventListener("app:error-report-ready", onReady);
    window.__360_ERROR_SINK__ = (payload) => {
      if (payload.level !== "error") return;
      void reportError({
        error: payload.error ?? payload.message,
        surface: String(payload.context?.scope ?? "Sistema"),
        action: payload.message,
        source: "client",
        details: payload.context,
      });
    };
    return () => {
      window.removeEventListener("app:error-report-ready", onReady);
      delete window.__360_ERROR_SINK__;
    };
  }, []);

  const submit = async () => {
    if (!pending || description.trim().length < 10) return;
    setSending(true);
    try {
      const result = await createErrorReport({
        errorLogId: pending.errorLogId,
        description,
        attemptedAction,
      });
      setProtocol(result.protocol);
      setDescription("");
      setAttemptedAction("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o chamado.");
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    setOpen(false);
    setDescription("");
    setAttemptedAction("");
    setProtocol(null);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : close())}>
      {/* z alto: o formulário precisa abrir por cima de outros diálogos (ex.: convocações). */}
      <DialogContent className="z-[110] border-destructive/40 sm:max-w-lg">
        {protocol ? (
          <div className="space-y-5 py-3 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
            <div className="space-y-2">
              <DialogTitle>Chamado enviado</DialogTitle>
              <DialogDescription>
                Obrigado pelo relato. Ele já está ligado ao erro técnico para análise.
              </DialogDescription>
            </div>
            <div className="rounded-md border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Protocolo</p>
              <p className="font-semibold">{protocol}</p>
            </div>
            <Button onClick={close} className="w-full">Concluir</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
              </div>
              <DialogTitle>Ajude-nos a corrigir este problema</DialogTitle>
              <DialogDescription>
                Seu relato será enviado como chamado junto aos dados técnicos da falha.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="error-description">O que aconteceu? *</Label>
                <Textarea
                  id="error-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 4000))}
                  placeholder="Descreva o problema com o máximo de detalhes possível."
                  rows={5}
                  autoFocus
                />
                <p className="text-right text-xs text-muted-foreground">{description.length}/4000</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="attempted-action">O que você estava tentando fazer?</Label>
                <Textarea
                  id="attempted-action"
                  value={attemptedAction}
                  onChange={(event) => setAttemptedAction(event.target.value.slice(0, 2000))}
                  placeholder="Ex.: salvar um documento, publicar uma convocação..."
                  rows={3}
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <span>Tela, data, usuário e erro técnico serão incluídos automaticamente.</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Agora não</Button>
              <Button
                variant="destructive"
                onClick={submit}
                disabled={sending || description.trim().length < 10}
              >
                {sending ? <Loader2 className="animate-spin" /> : <Bug />}
                Enviar chamado
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}