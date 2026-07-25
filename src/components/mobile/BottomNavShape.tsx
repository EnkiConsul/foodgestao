import { useEffect, useRef, useState } from "react";

/**
 * SVG shape for the mobile bottom nav with a concave notch centered
 * where the FAB sits. Uses semantic tokens (--card, --border, --foreground)
 * so it inherits theming.
 */
export function BottomNavShape({ height = 64 }: { height?: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(360);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setW(el.clientWidth || 360);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Notch geometry
  const notchR = 38; // half-width of the notch
  const notchDepth = 22;
  const cornerR = 18;
  const cx = w / 2;
  const h = height;

  // Path: top-left rounded → curve down into notch → curve up out → top-right rounded → close
  const d = [
    `M 0 ${cornerR}`,
    `Q 0 0 ${cornerR} 0`,
    `L ${cx - notchR - 12} 0`,
    // dip into notch
    `C ${cx - notchR + 4} 0, ${cx - notchR + 2} ${notchDepth}, ${cx} ${notchDepth}`,
    `C ${cx + notchR - 2} ${notchDepth}, ${cx + notchR - 4} 0, ${cx + notchR + 12} 0`,
    `L ${w - cornerR} 0`,
    `Q ${w} 0 ${w} ${cornerR}`,
    `L ${w} ${h}`,
    `L 0 ${h}`,
    "Z",
  ].join(" ");

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{ filter: "drop-shadow(0 -4px 12px hsl(var(--foreground) / 0.08))" }}
    >
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block"
      >
        <path d={d} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
      </svg>
    </div>
  );
}
