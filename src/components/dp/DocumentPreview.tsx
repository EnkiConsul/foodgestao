import type React from "react";
import { useEffect, useState } from "react";
import { Loader2, Download, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PdfCanvasViewer } from "./PdfCanvasViewer";
import { ImagemZoomViewer } from "./ImagemZoomViewer";
import { linkDocumentoAssinado } from "@/lib/documentoArquivo";

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
  /** Conteúdo extra abaixo do título (ex.: abas Documento / Comprovante). */
  toolbar?: React.ReactNode;
  /** Documento do DP cujo comprovante de pagamento aparece logo abaixo, na mesma rolagem. */
  comprovanteDocumentoId?: string | null;
  /** Comprovantes complementares (bucket dp-documentos), exibidos na mesma rolagem. */
  comprovantesExtras?: { id: string; path: string; mime: string | null }[];
  /** Mensagem de espera: nada é carregado enquanto estiver definida. */
  aguardando?: string | null;
  /** Ação principal no rodapé (ex.: "Assinar documento" após a leitura). */
  acaoRodape?: React.ReactNode;
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
  toolbar,
  comprovanteDocumentoId,
  comprovantesExtras,
  aguardando,
  acaoRodape,
}: DocumentPreviewProps) {
  const [comprovante, setComprovante] = useState<{ url: string; mime: string | null; nome: string | null } | null>(null);
  useEffect(() => {
    setComprovante(null);
    if (!open || !comprovanteDocumentoId || aguardando) return;
    let cancelado = false;
    linkDocumentoAssinado(comprovanteDocumentoId, expiresIn, "comprovante")
      .then((l) => { if (!cancelado && l) setComprovante({ url: l.url, mime: l.mimeType, nome: l.fileName }); })
      .catch(() => undefined);
    return () => { cancelado = true; };
  }, [open, comprovanteDocumentoId, expiresIn, aguardando]);
  const extrasChave = (comprovantesExtras ?? []).map((e) => e.path).join("|");
  const [extras, setExtras] = useState<{ id: string; url: string; mime: string | null; path: string }[]>([]);
  useEffect(() => {
    setExtras([]);
    if (!open || !comprovantesExtras?.length || aguardando) return;
    let cancelado = false;
    Promise.all(comprovantesExtras.map(async (e) => {
      const { data } = await supabase.storage.from("dp-documentos").createSignedUrl(e.path, expiresIn);
      return data?.signedUrl ? { id: e.id, url: data.signedUrl, mime: e.mime, path: e.path } : null;
    })).then((r) => { if (!cancelado) setExtras(r.filter((x): x is NonNullable<typeof x> => !!x)); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extrasChave, expiresIn, aguardando]);
  const listaComprovantes = [
    ...(comprovante ? [{ id: "principal", url: comprovante.url, mime: comprovante.mime, path: comprovante.nome ?? "" }] : []),
    ...extras,
  ];
  const temAnexos = listaComprovantes.length > 0;
  const [aba, setAba] = useState(-1);
  useEffect(() => { if (!open) setAba(-1); }, [open]);
  const abaComprovante = aba >= 0 ? listaComprovantes[aba] ?? null : null;
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(url ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || aguardando) {
      // Esperando validação digital (ou fechado): nada de busca concorrente e
      // o carregamento anterior é limpo para não prender o ícone girando.
      setLoading(false);
      return;
    }
    if (url) {
      setResolvedUrl(url);
      setLoading(false);
      setError(null);
      return;
    }
    if (!bucket || !path) {
      setLoading(false);
      return;
    }
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
  }, [open, url, bucket, path, expiresIn, aguardando]);

  /**
   * O link temporário do Storage vem com token na query, então a extensão
   * nunca fica no fim da URL. Limpamos query/hash e também olhamos o nome do
   * arquivo mostrado no título antes de dizer que o formato não é suportado.
   */
  const semParametros = (valor: string) => valor.split("?")[0].split("#")[0];
  const candidatos = [path, url, title]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(semParametros);
  const casa = (re: RegExp) => candidatos.some((c) => re.test(c));

  const isImage =
    (mime ?? "").startsWith("image/") || casa(/\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i);
  const isPdf = (mime ?? "") === "application/pdf" || casa(/\.pdf$/i);
  const ehHeicLegado =
    /^image\/hei[cf]/i.test(mime ?? "") || casa(/\.(heic|heif)$/i);

  // Fotos antigas em HEIC (iPhone) não abrem no navegador: convertemos para
  // JPEG aqui, só na hora de visualizar, sem mexer no arquivo guardado.
  const [heicUrl, setHeicUrl] = useState<string | null>(null);
  const [heicErro, setHeicErro] = useState(false);
  useEffect(() => {
    if (!open || !resolvedUrl || !ehHeicLegado) return;
    let cancelado = false;
    let criada: string | null = null;
    (async () => {
      try {
        const resp = await fetch(resolvedUrl);
        const blob = await resp.blob();
        const { default: heic2any } = await import("heic2any");
        const saida = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
        const jpeg = Array.isArray(saida) ? saida[0] : saida;
        if (cancelado) return;
        criada = URL.createObjectURL(jpeg as Blob);
        setHeicUrl(criada);
      } catch {
        if (!cancelado) setHeicErro(true);
      }
    })();
    return () => {
      cancelado = true;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [open, resolvedUrl, ehHeicLegado]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-0.5rem)] sm:w-[95vw] max-w-full sm:max-w-4xl h-[88svh] sm:h-[85vh] flex flex-col p-0 gap-0 overflow-hidden [padding-top:0] [padding-bottom:0] sm:[padding-top:0] sm:[padding-bottom:0]">
        <DialogHeader className="p-3 pr-12 sm:p-4 border-b">
          <DialogTitle className="truncate text-sm sm:text-base">{title}</DialogTitle>
          {toolbar}
        </DialogHeader>
        {temAnexos && (
          <div className="flex gap-1 overflow-x-auto border-b bg-background p-2">
            <Button size="sm" variant={aba === -1 ? "default" : "outline"} onClick={() => setAba(-1)}>Documento</Button>
            {listaComprovantes.map((c, i, arr) => (
              <Button key={c.id} size="sm" variant={aba === i ? "default" : "outline"} onClick={() => setAba(i)}>
                {arr.length > 1 ? `Comprovante ${i + 1}` : "Comprovante de Pagamento"}
              </Button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 bg-muted/30">
        <div className={abaComprovante ? "hidden" : "h-full"}>
          {aguardando ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p>{aguardando}</p>
            </div>
          ) : loading ? (
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
          ) : ehHeicLegado && !heicUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center text-sm text-muted-foreground">
              {heicErro ? (
                <>
                  <p>Foto de iPhone que o navegador não abre. Baixe para ver no seu aparelho.</p>
                  <Button asChild size="sm">
                    <a href={resolvedUrl} download>
                      <Download className="h-4 w-4 mr-2" /> Baixar foto
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p>Preparando a foto para exibir...</p>
                </>
              )}
            </div>
          ) : isImage ? (
            <ImagemZoomViewer src={heicUrl ?? resolvedUrl} alt={title} />
          ) : isPdf ? (
            <PdfCanvasViewer url={resolvedUrl} title={title} />
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
        {abaComprovante && (
          <div className="h-full">
            {(abaComprovante.mime ?? "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(abaComprovante.path) ? (
              <ImagemZoomViewer src={abaComprovante.url} alt="Comprovante de pagamento" />
            ) : (
              <PdfCanvasViewer url={abaComprovante.url} title="Comprovante de pagamento" />
            )}
          </div>
        )}
        </div>
        <DialogFooter className="p-2 sm:p-3 border-t flex-row flex-wrap sm:justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
          {acaoRodape}
          {resolvedUrl && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
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
