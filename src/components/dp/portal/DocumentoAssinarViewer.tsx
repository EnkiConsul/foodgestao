import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, PenLine, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";
import { ImagemZoomViewer } from "@/components/dp/ImagemZoomViewer";
import { podeConcluirAssinatura, proximaPaginaSemRubrica, rubricaObrigatoria } from "@/lib/dp/rubrica";

const BUCKET = "dp-documentos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  filePath: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  /** Nome civil do colaborador, usado como modelo da assinatura. */
  nomeColaborador: string;
  enviando?: boolean;
  /** Chamado com o PNG da assinatura quando todas as exigências foram cumpridas. */
  onConcluir: (assinaturaPng: string) => void;
};

/** Uma página do PDF renderizada em canvas, com a largura da tela e zoom. */
function PaginaPdf({ doc, numero, zoom, largura }: { doc: any; numero: number; zoom: number; largura: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const page = await doc.getPage(numero);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (largura / base.width) * zoom });
        const canvas = ref.current;
        if (!canvas || cancelado) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        } as any).promise;
      } catch {
        /* documento trocado ou renderização cancelada: esperado */
      }
    })();
    return () => { cancelado = true; };
  }, [doc, numero, zoom, largura]);
  return <canvas ref={ref} className="block mx-auto w-full max-w-full rounded bg-white shadow-md" />;
}

/**
 * Tela cheia de leitura e assinatura: o colaborador assina uma vez e, em
 * documentos com várias páginas, toca para rubricar cada folha enquanto lê.
 * O botão final só libera quando todas as páginas foram rubricadas — prova
 * de que o conteúdo inteiro foi visto.
 */
export function DocumentoAssinarViewer({
  open,
  onOpenChange,
  titulo,
  filePath,
  fileName,
  mimeType,
  nomeColaborador,
  enviando,
  onConcluir,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [rubricadas, setRubricadas] = useState<Set<number>>(new Set());
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const assinaturaRef = useRef<HTMLDivElement>(null);
  const paginaRefs = useRef(new Map<number, HTMLDivElement>());

  const nomeArquivo = fileName ?? filePath ?? "";
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(nomeArquivo);
  const isImage =
    (mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(nomeArquivo);

  // Ao abrir outro documento, tudo recomeça: link, páginas, rubricas e zoom.
  useEffect(() => {
    setUrl(null);
    setErro(false);
    setPdfDoc(null);
    setTotalPaginas(1);
    setRubricadas(new Set());
    setAssinatura(null);
    setZoom(1);
    if (!open || !filePath) return;
    let cancelado = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 300)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error || !data?.signedUrl) setErro(true);
        else setUrl(data.signedUrl);
      });
    return () => { cancelado = true; };
  }, [open, filePath]);

  // pdfjs entra por importação dinâmica: fora daqui, nenhuma tela paga o custo.
  useEffect(() => {
    if (!url || !isPdf) return;
    let cancelado = false;
    let doc: any = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
        (pdfjs.GlobalWorkerOptions as any).workerPort ||= new worker.default();
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        doc = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelado) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setTotalPaginas(doc.numPages);
      } catch {
        if (!cancelado) setErro(true);
      }
    })();
    return () => {
      cancelado = true;
      doc?.destroy();
    };
  }, [url, isPdf]);

  const paginas = isPdf ? totalPaginas : 1;
  const precisaRubrica = rubricaObrigatoria(paginas);
  const liberado = podeConcluirAssinatura(!!assinatura, paginas, rubricadas.size);
  const proxima = proximaPaginaSemRubrica(paginas, rubricadas);
  const larguraPagina = Math.min(window.innerWidth - 32, 900);

  const rubricar = (n: number) => {
    if (!assinatura) {
      toast.info("Faça sua assinatura no topo antes de rubricar as páginas.");
      assinaturaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const novas = new Set(rubricadas).add(n);
    setRubricadas(novas);
    // Leva o colaborador direto para a próxima folha ainda sem rubrica.
    const alvo = proximaPaginaSemRubrica(paginas, novas);
    if (alvo !== null) {
      setTimeout(() => {
        paginaRefs.current.get(alvo)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } else {
      toast.success("Todas as páginas rubricadas. Agora é só concluir a assinatura.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-full max-w-full flex-col gap-0 rounded-none p-0 sm:h-[96dvh] sm:max-w-3xl sm:rounded-lg">
        <DialogHeader className="border-b p-3 pr-12">
          <DialogTitle className="truncate text-sm sm:text-base">{titulo}</DialogTitle>
          {precisaRubrica && (
            <p className="text-xs text-muted-foreground">
              {rubricadas.size === paginas
                ? "Todas as páginas rubricadas. Você já pode concluir."
                : `Toque em "Rubricar" em cada página para confirmar que leu tudo (${rubricadas.size} de ${paginas}).`}
            </p>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          {/* Assinatura uma única vez, no topo: ela vale para as rubricas. */}
          <div ref={assinaturaRef} className="scroll-mt-2 p-3">
            <AssinaturaCaptura nomePadrao={nomeColaborador} onChange={setAssinatura} />
          </div>

          {!filePath ? (
            <p className="px-4 pb-6 text-center text-sm text-muted-foreground">
              Este documento não tem arquivo anexado. Confira os dados com o seu gestor antes de assinar.
            </p>
          ) : erro ? (
            <div className="flex flex-col items-center gap-3 px-6 pb-6 text-center text-sm text-muted-foreground">
              <p>Não foi possível exibir o documento aqui.</p>
              {url && (
                <Button asChild size="sm" variant="outline">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Abrir em nova aba
                  </a>
                </Button>
              )}
            </div>
          ) : !url ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isImage ? (
            <div className="h-[60dvh]">
              <ImagemZoomViewer src={url} alt={titulo} />
            </div>
          ) : isPdf ? (
            <div className="p-2 sm:p-4">
              <div className="mb-2 flex items-center justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Reduzir zoom"
                  onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}>
                  <ZoomOut className="size-4" />
                </Button>
                <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Aumentar zoom"
                  onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}>
                  <ZoomIn className="size-4" />
                </Button>
              </div>
              {!pdfDoc ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
                  <div
                    key={n}
                    className="mb-4 scroll-mt-2"
                    ref={(el) => {
                      if (el) paginaRefs.current.set(n, el);
                      else paginaRefs.current.delete(n);
                    }}
                  >
                    <PaginaPdf doc={pdfDoc} numero={n} zoom={zoom} largura={larguraPagina} />
                    {precisaRubrica && (
                      <div className="mt-1.5 flex items-center justify-center">
                        {rubricadas.has(n) ? (
                          <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-500/10 px-3 py-1.5">
                            <img src={assinatura ?? undefined} alt="" className="h-8 max-w-24 object-contain" />
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Página {n} rubricada
                            </span>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant={proxima === n ? "default" : "outline"}
                            size="sm"
                            className="min-h-9"
                            onClick={() => rubricar(n)}
                          >
                            <PenLine className="mr-1 h-4 w-4" /> Rubricar página {n}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 pb-6 text-center text-sm text-muted-foreground">
              <p>Este formato não abre aqui. Veja o arquivo em nova aba antes de assinar.</p>
              <Button asChild size="sm" variant="outline">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir em nova aba
                </a>
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t p-3 sm:flex-col">
          {precisaRubrica && !liberado && assinatura && (
            <p className="text-center text-xs text-amber-700">
              Falta rubricar {paginas - rubricadas.size} {paginas - rubricadas.size === 1 ? "página" : "páginas"} para concluir.
            </p>
          )}
          <Button
            className="min-h-11 w-full"
            disabled={!liberado || enviando}
            onClick={() => assinatura && onConcluir(assinatura)}
          >
            <PenLine className="mr-1 h-4 w-4" />
            {enviando ? "Assinando…" : "Concluir e Assinar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
