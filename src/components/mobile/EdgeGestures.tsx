import { useEffect } from "react";
import { useEdgeGestures } from "@/hooks/useEdgeGestures";
import { instalarSwipeAbas } from "@/lib/nav/tabSwipe";
import { haptic } from "@/lib/haptics";

/** Ativa os gestos de borda. Deve ficar dentro de um `SidebarProvider`. */
export function EdgeGestures() {
  useEdgeGestures();
  // Gesto lateral global: troca de abas e fecha janelas abertas por arrasto.
  useEffect(() => {
    instalarSwipeAbas(() => haptic(6));
  }, []);
  return null;
}
