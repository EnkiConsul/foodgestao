import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Move, RotateCcw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BANNER_DEFAULTS, bannerImageStyle, type BannerFit } from "@/lib/orders/storefront";

export interface BannerDisplay {
  fit: BannerFit;
  zoom: number;
  focusX: number;
  focusY: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Moldura de prévia (proporção do dispositivo) com arraste para reposicionar. */
function Frame({
  label,
  ratio,
  preview,
  display,
  onFocusChange,
}: {
  label: string;
  ratio: string;
  preview: string | null;
  display: BannerDisplay;
  onFocusChange: (focus: { focusX: number; focusY: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      const start = dragging.current;
      if (!el || !start) return;
      const rect = el.getBoundingClientRect();
      // Arrastar a imagem para a direita revela a parte esquerda: foco anda ao contrário.
      const dx = ((clientX - start.x) / rect.width) * 100;
      const dy = ((clientY - start.y) / rect.height) * 100;
      onFocusChange({
        focusX: clamp(start.fx - dx, 0, 100),
        focusY: clamp(start.fy - dy, 0, 100),
      });
    },
    [onFocusChange],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      move(e.clientX, e.clientY);
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [move]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-lg border bg-muted/40 ${ratio} ${
          preview ? "cursor-grab active:cursor-grabbing touch-none" : ""
        }`}
        onPointerDown={(e) => {
          if (!preview) return;
          dragging.current = { x: e.clientX, y: e.clientY, fx: display.focusX, fy: display.focusY };
        }}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
            />
            <img
              src={preview}
              alt={`Prévia do banner (${label})`}
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
              style={bannerImageStyle(display)}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Envie um banner para ajustar
          </div>
        )}
      </div>
    </div>
  );
}

/** Controle de enquadramento do banner: encaixe, zoom e posição, com prévia por resolução. */
export default function BannerFramer({
  preview,
  value,
  onChange,
}: {
  preview: string | null;
  value: BannerDisplay;
  onChange: (next: BannerDisplay) => void;
}) {
  const [live, setLive] = useState(value);

  useEffect(() => setLive(value), [value]);

  const update = (patch: Partial<BannerDisplay>) => {
    const next = { ...live, ...patch };
    setLive(next);
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Crop className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Enquadramento do banner</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            update({
              fit: BANNER_DEFAULTS.fit,
              zoom: BANNER_DEFAULTS.zoom,
              focusX: BANNER_DEFAULTS.focusX,
              focusY: BANNER_DEFAULTS.focusY,
            })
          }
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restaurar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Frame
          label="Celular (16:9)"
          ratio="aspect-[16/9]"
          preview={preview}
          display={live}
          onFocusChange={(f) => update(f)}
        />
        <Frame
          label="Computador (16:6)"
          ratio="aspect-[16/6]"
          preview={preview}
          display={live}
          onFocusChange={(f) => update(f)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Encaixe</Label>
        <ToggleGroup
          type="single"
          value={live.fit}
          onValueChange={(v) => v && update({ fit: v as BannerFit })}
          className="justify-start"
        >
          <ToggleGroupItem value="contain" className="text-xs">
            Mostrar inteiro
          </ToggleGroupItem>
          <ToggleGroupItem value="cover" className="text-xs">
            Preencher
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          "Mostrar inteiro" nunca corta a arte. "Preencher" ocupa toda a capa e pode recortar as bordas.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> Zoom · {live.zoom.toFixed(2)}x
          </Label>
          <Slider
            value={[live.zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            onValueChange={([v]) => update({ zoom: clamp(v, MIN_ZOOM, MAX_ZOOM) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Move className="h-3.5 w-3.5" aria-hidden="true" /> Horizontal · {Math.round(live.focusX)}%
          </Label>
          <Slider
            value={[live.focusX]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => update({ focusX: clamp(v, 0, 100) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Move className="h-3.5 w-3.5 rotate-90" aria-hidden="true" /> Vertical ·{" "}
            {Math.round(live.focusY)}%
          </Label>
          <Slider
            value={[live.focusY]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => update({ focusY: clamp(v, 0, 100) })}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Arraste dentro das prévias para reposicionar. O mesmo ajuste é aplicado em celular e computador,
        então confira as duas molduras antes de salvar.
      </p>
    </div>
  );
}
