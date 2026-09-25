import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { Loader2, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// Worker compartilhado com os demais visualizadores de PDF do DP.
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerPort: Worker } })
  .GlobalWorkerOptions.workerPort ||= new PdfWorker();

type Props = {
  /** URL (assinada ou blob) do PDF a renderizar. */
  url: string;
  title?: string;
};

/**
 * Visualizador de PDF renderizado em canvas (pdfjs).
 * Substitui o iframe nativo do navegador, que falha em alguns computadores
 * (plugin desativado, bloqueio de extensão ou política de frame), exibindo
 * o ícone de "documento quebrado". Aqui o PDF sempre abre.
 */
export function PdfCanvasViewer({ url, title }: Props) {
  const [paginas, setPaginas] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const taskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(false);
    (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        const task = pdfjsLib.getDocument({ data: buf });
        taskRef.current = task;
        const doc = await task.promise;
        if (cancelado) {
          task.destroy();
          return;
        }
        docRef.current = doc;
        setPaginas(doc.numPages);
      } catch {
        if (!cancelado) setErro(true);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
      taskRef.current?.destroy();
      taskRef.current = null;
      docRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const doc = docRef.current;
    const container = containerRef.current;
    if (!doc || !container || paginas === 0) return;
    let cancelado = false;
    container.innerHTML = "";
    (async () => {
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelado) return;
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const larguraDisponivel = Math.max(container.clientWidth - 32, 320);
        const escala = (larguraDisponivel / base.width) * zoom;
        const viewport = page.getViewport({ scale: escala });
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "mx-auto mb-4 shadow-md bg-white rounded";
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        container.appendChild(canvas);
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        } as Parameters<typeof page.render>[0]).promise;
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [paginas, zoom]);

  if (erro) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground px-6 text-center">
        <p>Não foi possível exibir o PDF aqui.</p>
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" /> Abrir em nova aba
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b bg-background">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Reduzir zoom"
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Aumentar zoom"
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto p-4" aria-label={title}>
        {carregando && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
