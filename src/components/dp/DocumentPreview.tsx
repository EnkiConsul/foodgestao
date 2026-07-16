import { useEffect, useState } from "react";
import { Loader2, Download, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface DocumentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título mostrado no cabeçalho do modal */
  title?: string;
  /** URL pública direta OU (path + bucket) para signed URL */
  url?: string | null;
  bucket?: string;
  path?: string | null;
  mime?: string | null;
  /** Segundos de validade da signed URL (default 300) */
  expiresIn?: number;
}

/**
 * Preview inline genérico para PDFs e imagens.
 * Aceita URL pronta ou (bucket, path) para gerar signed URL do storage.
 */
export function DocumentPreview({
  open,
  onOpenChange,
  title = "Visualizar documento",
  url,
  bucket,
  path,
  mime,
  expiresIn = 300,
}: DocumentPreviewProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(url ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (url) {
      setResolvedUrl(url);
      return;
    }
    if (!bucket || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.storage.from(bucket).createSignedUrl(path, expiresIn).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setError(error?.message ?? "Não foi possível gerar a URL");
      } else {
        setResolvedUrl(data.signedUrl);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, url, bucket, path, expiresIn]);

  const isImage = (mime ?? "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(path ?? url ?? "");
  const isPdf = (mime ?? "") === "application/pdf" || /\.pdf$/i.test(path ?? url ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="truncate">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/30">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-sm text-destructive px-6 text-center">
              {error}
            </div>
          ) : !resolvedUrl ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Documento indisponível.
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center h-full overflow-auto p-4">
              <img src={resolvedUrl} alt={title} className="max-h-full max-w-full object-contain" />
            </div>
          ) : isPdf ? (
            <iframe src={resolvedUrl} title={title} className="w-full h-full border-0" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
              <p>Preview não suportado para este formato.</p>
              <Button asChild size="sm" variant="outline">
                <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Abrir em nova aba
                </a>
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="p-3 border-t flex-row sm:justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          {resolvedUrl && (
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Nova aba
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={resolvedUrl} download>
                  <Download className="h-4 w-4 mr-2" /> Baixar
                </a>
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
