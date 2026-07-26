import { useEdgeGestures } from "@/hooks/useEdgeGestures";

/** Ativa os gestos de borda. Deve ficar dentro de um `SidebarProvider`. */
export function EdgeGestures() {
  useEdgeGestures();
  return null;
}
