/**
 * Enquadramento de foto: zoom, arrasto e giro de 90°. Modo "retrato" usa a
 * moldura 3x4 com guia de rosto (crachá); modo "documento" recorta bordas.
 * Tudo acontece no aparelho; o resultado sai em JPEG.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ModoEnquadramento = "retrato" | "documento";

interface Props {
  /** Arquivo ou URL (blob/same-origin) da imagem. */
  fonte: File | string | null;
  modo: ModoEnquadramento;
  titulo: string;
  textoConfirmar?: string;
  onConfirmar: (arquivo: File) => void | Promise<void>;
  onCancelar: () => void;
  /** Ação extra no rodapé (ex.: escolher outra foto). */
  acaoExtra?: React.ReactNode;
}

const LARGURA_SAIDA_RETRATO = 900; // 900x1200 px

export function ImagemEnquadrarDialog({ fonte, modo, titulo, textoConfirmar = "Confirmar Foto", onConfirmar, onCancelar, acaoExtra }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [giro, setGiro] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const [quadro, setQuadro] = useState({ w: 300, h: 400 });
  const arrasto = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const toques = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    setGiro(0); setZoom(1); setPan({ x: 0, y: 0 }); setErro(null); setImg(null);
    if (!fonte) return;
    const url = typeof fonte === "string" ? fonte : URL.createObjectURL(fonte);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setErro("Não foi possível abrir esta imagem.");
    i.src = url;
    return () => { if (typeof fonte !== "string") URL.revokeObjectURL(url); };
  }, [fonte]);

  const deitado = giro % 180 !== 0;
  const imgW = img ? (deitado ? img.naturalHeight : img.naturalWidth) : 3;
  const imgH = img ? (deitado ? img.naturalWidth : img.naturalHeight) : 4;
  const proporcao = modo === "retrato" ? 3 / 4 : imgW / imgH;

  // Quadro cabe na tela do celular, mantendo a proporção do recorte.
  useEffect(() => {
    const medir = () => {
      const maxW = Math.min(window.innerWidth - 48, 420);
      const maxH = Math.min(window.innerHeight * 0.5, 460);
      let w = maxW, h = w / proporcao;
      if (h > maxH) { h = maxH; w = h * proporcao; }
      setQuadro({ w: Math.round(w), h: Math.round(h) });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [proporcao]);

  // Escala base: a imagem cobre o quadro inteiro (sem faixas vazias).
  const base = Math.max(quadro.w / imgW, quadro.h / imgH);
  const escala = base * zoom;
  const limitar = useCallback((p: { x: number; y: number }, z = zoom) => {
    const s = base * z;
    const mx = Math.max(0, (imgW * s - quadro.w) / 2);
    const my = Math.max(0, (imgH * s - quadro.h) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  }, [base, imgW, imgH, quadro, zoom]);

  useEffect(() => { setPan((p) => limitar(p)); }, [zoom, giro, quadro, limitar]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.current.size === 2) {
      const [a, b] = [...toques.current.values()];
      pinca.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      arrasto.current = null;
    } else {
      arrasto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!toques.current.has(e.pointerId)) return;
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca.current && toques.current.size === 2) {
      const [a, b] = [...toques.current.values()];
      const z = Math.min(3, Math.max(1, pinca.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinca.current.dist)));
      setZoom(z);
      return;
    }
    const d = arrasto.current;
    if (!d || d.id !== e.pointerId) return;
    setPan(limitar({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }));
  };
  const onUp = (e: React.PointerEvent) => {
    toques.current.delete(e.pointerId);
    if (toques.current.size < 2) pinca.current = null;
    if (arrasto.current?.id === e.pointerId) arrasto.current = null;
  };

  const confirmar = async () => {
    if (!img) return;
    setSalvando(true);
    try {
      // Área visível do quadro convertida para pixels da imagem girada.
      const fator = 1 / escala;
      const cortW = quadro.w * fator, cortH = quadro.h * fator;
      const cx = imgW / 2 - pan.x * fator, cy = imgH / 2 - pan.y * fator;
      const saidaW = modo === "retrato" ? LARGURA_SAIDA_RETRATO : Math.min(2400, Math.round(cortW));
      const saidaH = Math.round(saidaW / proporcao);
      const canvas = document.createElement("canvas");
      canvas.width = saidaW; canvas.height = saidaH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Seu aparelho não conseguiu preparar a foto.");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, saidaW, saidaH);
      const k = saidaW / cortW;
      ctx.translate(saidaW / 2, saidaH / 2);
      ctx.scale(k, k);
      ctx.translate(-cx + imgW / 2, -cy + imgH / 2);
      ctx.rotate((giro * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!blob) throw new Error("Não foi possível gerar a foto.");
      const nome = (typeof fonte === "string" ? "foto" : fonte!.name.replace(/\.[^.]+$/, "")) + ".jpg";
      await onConfirmar(new File([blob], nome, { type: "image/jpeg" }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!fonte} onOpenChange={(v) => { if (!v && !salvando) onCancelar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {modo === "retrato"
              ? "Arraste e aproxime até o rosto ficar dentro da moldura: olhos na linha de cima, queixo na de baixo."
              : "Arraste e aproxime para tirar as sobras de mesa ou fundo. Gire se a foto estiver deitada."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid place-items-center">
          <div
            ref={quadroRef}
            className="relative overflow-hidden rounded-md bg-muted select-none"
            style={{ width: quadro.w, height: quadro.h, touchAction: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            aria-label="Área de enquadramento"
          >
            {img ? (
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
                style={{
                  width: img.naturalWidth * escala,
                  height: img.naturalHeight * escala,
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${giro}deg)`,
                }}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                {erro ?? <Loader2 className="h-5 w-5 animate-spin" />}
              </div>
            )}
            {modo === "retrato" && img && (
              <svg className="absolute inset-0 pointer-events-none" width={quadro.w} height={quadro.h} aria-hidden>
                <defs>
                  <mask id="mascara-cracha">
                    <rect width="100%" height="100%" fill="white" />
                    <ellipse cx={quadro.w / 2} cy={quadro.h * 0.44} rx={quadro.w * 0.32} ry={quadro.h * 0.3} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="hsl(var(--foreground))" fillOpacity="0.45" mask="url(#mascara-cracha)" />
                <ellipse cx={quadro.w / 2} cy={quadro.h * 0.44} rx={quadro.w * 0.32} ry={quadro.h * 0.3}
                  fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
                <line x1={quadro.w * 0.28} x2={quadro.w * 0.72} y1={quadro.h * 0.38} y2={quadro.h * 0.38}
                  stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeOpacity="0.8" />
                <line x1={quadro.w * 0.36} x2={quadro.w * 0.64} y1={quadro.h * 0.72} y2={quadro.h * 0.72}
                  stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeOpacity="0.8" />
              </svg>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10">Zoom</span>
          <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={([z]) => setZoom(z)} aria-label="Zoom" />
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Girar 90 graus"
            onClick={() => { setGiro((g) => (g + 90) % 360); setPan({ x: 0, y: 0 }); }}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        {modo === "retrato" && (
          <p className="text-xs text-muted-foreground">Fundo claro, rosto iluminado, sem boné ou óculos escuros.</p>
        )}
        {erro && img && <p className="text-xs text-destructive">{erro}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {acaoExtra}
          <Button type="button" variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void confirmar()} disabled={!img || salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
