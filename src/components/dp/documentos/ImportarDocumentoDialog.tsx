import { useEffect, useState } from "react";
import { History, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";

/**
 * Janela única de importação de documentos: a mesma em Gerir Documentos, no
 * atalho do Painel Inteligente e nas Ações do Dia — sempre com a aba de
 * envio e a aba de histórico de lotes.
 */
export function ImportarDocumentoDialog({
  open,
  onOpenChange,
  tipoInicial,
  referenciaInicial,
  loteAbertoId,
  abaInicial = "enviar",
  onLoteConcluido,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipoInicial?: string;
  referenciaInicial?: string;
  loteAbertoId?: string;
  /** Aba ao abrir: "enviar" (padrão) ou "historico". */
  abaInicial?: "enviar" | "historico";
  onLoteConcluido?: () => void;
}) {
  const [aba, setAba] = useState<"enviar" | "historico">(abaInicial);
  const [historicoNonce, setHistoricoNonce] = useState(0);

  // Toda abertura respeita a aba pedida por quem chamou (Importar × Histórico).
  useEffect(() => {
    if (open) {
      setAba(abaInicial);
      if (abaInicial === "historico") setHistoricoNonce((n) => n + 1);
    }
  }, [open, abaInicial]);

  const somenteHistorico = aba === "historico";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-5xl sm:p-0">
        <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left">
          <DialogTitle>{somenteHistorico ? "Histórico de Importações" : "Importar Documento"}</DialogTitle>
          <DialogDescription>
            {somenteHistorico ? "Lotes enviados e resultados da conferência." : "Envie o PDF e confira as páginas antes de salvar."}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={aba}
          onValueChange={(value) => {
            setAba(value as "enviar" | "historico");
            if (value === "historico") setHistoricoNonce((n) => n + 1);
          }}
          className="shrink-0 px-4 pt-3"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="enviar" className="gap-2"><Upload className="h-4 w-4" />Novo envio</TabsTrigger>
            <TabsTrigger value="historico" className="gap-2"><History className="h-4 w-4" />Histórico de lotes</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {open && (
            <BulkImportPanel
              title="Importar Documento"
              tipoInicial={tipoInicial}
              referenciaInicial={referenciaInicial}
              loteAbertoId={loteAbertoId}
              onLoteConcluido={onLoteConcluido}
              abrirHistoricoNonce={historicoNonce}
              somenteHistorico={somenteHistorico}
              emJanela
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
