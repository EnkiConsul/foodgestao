import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileUp } from "lucide-react";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Atalho do Início: abre a mesma janela de importação de Gerir Documentos (sem pendências). */
export function ImportarDocumentoAtalho({ emFaixa = false }: { emFaixa?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setAberto(true)}
        className={cn("h-auto w-full justify-start rounded-2xl border bg-card text-left hover:bg-muted/40", emFaixa ? "min-h-11 min-w-0 gap-2 px-2 py-2 sm:px-3" : "gap-3 px-4 py-3")}
        aria-label="Importar documento"
      >
        <span className={cn("shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", emFaixa ? "hidden h-7 w-7 sm:flex" : "flex h-9 w-9")}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("whitespace-normal font-semibold", emFaixa ? "text-[11px] leading-tight sm:text-xs" : "text-sm")}>Importar documento</p>
          {!emFaixa && <p className="truncate text-xs text-muted-foreground">Enviar PDF</p>}
        </div>
        {!emFaixa && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </Button>
      <DpDialogShell
        open={aberto}
        onOpenChange={setAberto}
        icon={FileUp}
        size="xl"
        title="Importar documento"
        description="Envie o PDF para conferir e vincular as páginas aos colaboradores."
      >
        <BulkImportPanel
          title="Enviar PDF"
          onLoteConcluido={() => {
            void qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
            setAberto(false);
          }}
        />
      </DpDialogShell>
    </>
  );
}
