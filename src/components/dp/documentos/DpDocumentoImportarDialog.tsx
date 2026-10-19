import { FileUp } from "lucide-react";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";
import { docTipoLabel } from "@/lib/dp/documentoTipos";

/** Lê o atalho de importação ("/dp/documentos?tipo=…&competencia=…" ou "?lote=…"). */
export function alvoImportacao(url: string | undefined | null) {
  if (!url) return null;
  const [caminho, query] = url.split("?");
  if (caminho !== "/dp/documentos" || !query) return null;
  const q = new URLSearchParams(query);
  const tipo = q.get("tipo") ?? undefined;
  const competencia = q.get("competencia") ?? undefined;
  const lote = q.get("lote") ?? undefined;
  if (!tipo && !lote) return null;
  return { tipo, competencia, lote };
}

/** Janela de importação aberta direto das Ações do Dia, já preenchida. */
export function DpDocumentoImportarDialog({
  url,
  open,
  onOpenChange,
  onConcluido,
}: {
  url: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConcluido?: () => void;
}) {
  const alvo = alvoImportacao(url);
  if (!alvo) return null;
  return (
    <DpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={FileUp}
      size="xl"
      title={alvo.tipo ? `Importar ${docTipoLabel(alvo.tipo)}` : "Revisar lote"}
      description="Envie o PDF para conferir e vincular as páginas aos colaboradores."
    >
      <BulkImportPanel
        title="Enviar PDF"
        tipoInicial={alvo.tipo}
        referenciaInicial={alvo.competencia ? `${alvo.competencia}-01` : undefined}
        loteAbertoId={alvo.lote}
        onLoteConcluido={() => {
          onConcluido?.();
          onOpenChange(false);
        }}
      />
    </DpDialogShell>
  );
}
