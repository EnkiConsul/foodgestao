import { Loader2, FileText, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BulkProgressBannerProps {
  phase: "ocr" | "saving";
  current: number;
  total: number;
  className?: string;
}

/**
 * Banner de progresso reutilizado durante o OCR do lote e durante o
 * salvamento (aprovação em massa) dos documentos.
 */
export function BulkProgressBanner({ phase, current, total, className }: BulkProgressBannerProps) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const Icon = phase === "ocr" ? FileText : Save;
  const title = phase === "ocr"
    ? "Processando páginas do PDF"
    : "Salvando documentos";
  const subtitle = phase === "ocr"
    ? "Aguarde — as páginas aparecerão juntas assim que o processamento terminar."
    : "Estamos gravando cada documento aprovado. Não feche esta janela.";
  const counter = total > 0 ? `${current} de ${total}` : `${current}`;

  return (
    <div className={cn(
      "border rounded-md bg-primary/5 border-primary/20 p-6 flex flex-col items-center gap-3 text-center",
      className,
    )}>
      <div className="flex items-center gap-2 text-primary">
        <Icon className="h-5 w-5" />
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground max-w-md">{subtitle}</div>
      </div>
      <div className="w-full max-w-md space-y-1.5">
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{counter} {phase === "ocr" ? "página(s)" : "documento(s)"}</span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
}
