import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileUp } from "lucide-react";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";

/** Atalho do Início: abre a mesma janela de importação de Gerir Documentos (sem pendências). */
export function ImportarDocumentoAtalho() {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-[hsl(var(--dp-border))] bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-label="Importar documento"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileUp className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Importar documento</p>
          <p className="truncate text-xs text-muted-foreground">Envie o PDF da contabilidade</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <DpDialogShell
        open={aberto}
        onOpenChange={setAberto}
        icon={FileUp}
        size="xl"
        title="Importar documento"
        description="Envie o PDF do escritório contábil. O sistema distribui cada página ao colaborador."
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
