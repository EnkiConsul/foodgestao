import { useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePinchZoom } from "@/hooks/usePinchZoom";

/** Imagem com zoom por pinça e botões, sem distorcer: cresce e cria rolagem. */
export function ImagemZoomViewer({ src, alt }: { src: string; alt?: string }) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  usePinchZoom(scrollRef, conteudoRef, { zoom, setZoom, min: 1, max: 5 });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b bg-background">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Reduzir zoom"
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}>
          <ZoomOut className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Aumentar zoom"
          onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))}>
          <ZoomIn className="size-4" />
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-2 sm:p-4" style={{ touchAction: "pan-x pan-y" }}>
        <div ref={conteudoRef} style={{ width: `${zoom * 100}%` }} className="mx-auto">
          <img src={src} alt={alt} className="block w-full h-auto select-none" draggable={false} />
        </div>
      </div>
    </div>
  );
}
