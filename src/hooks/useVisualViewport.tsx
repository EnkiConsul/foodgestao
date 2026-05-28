import { useEffect } from "react";

/**
 * Tracks the visual viewport height (which shrinks when the mobile keyboard opens)
 * and exposes it as a CSS variable `--vvh` on the document root.
 * Usage: `height: var(--vvh, 100dvh)` or `max-height: var(--vvh, 100dvh)`.
 */
export function useVisualViewport() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const setVar = () => {
      const h = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--vvh", `${h}px`);
    };

    setVar();

    if (vv) {
      vv.addEventListener("resize", setVar);
      vv.addEventListener("scroll", setVar);
    }
    window.addEventListener("resize", setVar);
    window.addEventListener("orientationchange", setVar);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVar);
        vv.removeEventListener("scroll", setVar);
      }
      window.removeEventListener("resize", setVar);
      window.removeEventListener("orientationchange", setVar);
    };
  }, []);
}
