import { forwardRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

type DpFilePickerProps = {
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  id?: string;
};

/**
 * Seletor de arquivo com aparência do design system (o controle nativo
 * `input[type=file]` fica oculto, mas continua sendo a fonte do valor).
 */
export const DpFilePicker = forwardRef<HTMLInputElement, DpFilePickerProps>(
  ({ accept, file, onFileChange, id }, ref) => (
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0 sm:min-h-10"
        onClick={() => {
          const el = (ref && typeof ref === "object" ? ref.current : null) ?? null;
          el?.click();
        }}
      >
        <Paperclip className="mr-2 size-4" />
        Selecionar arquivo
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {file ? file.name : "Nenhum arquivo escolhido"}
      </span>
    </div>
  ),
);
DpFilePicker.displayName = "DpFilePicker";
