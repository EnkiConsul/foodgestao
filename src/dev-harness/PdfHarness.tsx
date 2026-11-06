import { createRoot } from "react-dom/client";
import { PdfCanvasViewer } from "@/components/dp/PdfCanvasViewer";

export function mount(el: HTMLElement, url: string) {
  createRoot(el).render(<div style={{ height: "100%" }}><PdfCanvasViewer url={url} title="teste" /></div>);
}
