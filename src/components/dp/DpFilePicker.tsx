import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

type DpFilePickerProps = {
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  id?: string;
};

/**
 * Seletor de arquivo com aparência do design system. O controle nativo
 * `input[type=file]` fica invisível mas continua no fluxo e é acionado por um
 * `<label htmlFor>` — ativação nativa, que funciona em qualquer navegador
 * móvel (clique programático em elemento `sr-only` é ignorado em alguns).
 */
export const DpFilePicker = forwardRef<HTMLInputElement, DpFilePickerProps>(
  ({ accept, file, onFileChange, id }, ref) => {
    const innerRef = useRef<HTMLInputElement>(null);
    const autoId = useId();
    const inputId = id ?? `dp-file-${autoId}`;

    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement, []);

    return (
      <div className="relative flex min-w-0 items-center gap-2">
        <input
          ref={innerRef}
          id={inputId}
          type="file"
          accept={accept}
          className="pointer-events-none absolute size-px opacity-0"
          // Permite reescolher o mesmo arquivo (o onChange não dispara se o
          // valor permanecer igual).
          onClick={(e) => {
            e.currentTarget.value = "";
          }}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        <Button asChild type="button" variant="outline" className="min-h-11 shrink-0 sm:min-h-10">
          <label htmlFor={inputId} className="cursor-pointer">
            <Paperclip className="mr-2 size-4" />
            Selecionar arquivo
          </label>
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {file ? file.name : "Nenhum arquivo escolhido"}
        </span>
      </div>
    );
  },
);
DpFilePicker.displayName = "DpFilePicker";
