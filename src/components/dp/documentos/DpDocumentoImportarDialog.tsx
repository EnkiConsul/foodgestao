import { ImportarDocumentoDialog } from "@/components/dp/documentos/ImportarDocumentoDialog";

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
    <ImportarDocumentoDialog
      open={open}
      onOpenChange={onOpenChange}
      tipoInicial={alvo.tipo}
      referenciaInicial={alvo.competencia ? `${alvo.competencia}-01` : undefined}
      loteAbertoId={alvo.lote}
      onLoteConcluido={() => {
        onConcluido?.();
        onOpenChange(false);
      }}
    />
  );
}
