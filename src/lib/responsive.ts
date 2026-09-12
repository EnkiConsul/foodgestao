export const TABLET_BREAKPOINT = 768;
export const COMPACT_LANDSCAPE_MAX_HEIGHT = 500;

/** Celular deitado usa a mesma organização visual de um tablet. */
export function isCompactLandscapeViewport() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(orientation: landscape)").matches &&
    window.innerHeight <= COMPACT_LANDSCAPE_MAX_HEIGHT
  );
}

export function isMobileLayoutViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < TABLET_BREAKPOINT && !isCompactLandscapeViewport();
}