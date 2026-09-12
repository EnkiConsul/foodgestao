import * as React from "react";
import {
  isCompactLandscapeViewport,
  isMobileLayoutViewport,
  isTabletLayoutViewport,
  TABLET_BREAKPOINT,
} from "@/lib/responsive";

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
    const orientationMql = window.matchMedia("(orientation: landscape)");
    const onChange = () => {
      setIsMobile(isMobileLayoutViewport());
    };
    mql.addEventListener("change", onChange);
    orientationMql.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    onChange();
    return () => {
      mql.removeEventListener("change", onChange);
      orientationMql.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);

  return !!isMobile;
}

export function useIsCompactLandscape() {
  const [isCompactLandscape, setIsCompactLandscape] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setIsCompactLandscape(isCompactLandscapeViewport());
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    onChange();
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return isCompactLandscape;
}

export function useIsTabletLayout() {
  const [isTabletLayout, setIsTabletLayout] = React.useState(() => isTabletLayoutViewport());

  React.useEffect(() => {
    const onChange = () => setIsTabletLayout(isTabletLayoutViewport());
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    onChange();
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return isTabletLayout;
}
