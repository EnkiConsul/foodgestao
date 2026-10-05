import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acionarInput, useConferenciaDigitalizacao } from "@/components/dp/documentos/ConferenciaDigitalizacao";

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

    const { abrirSeletor, conferir, dialogo } = useConferenciaDigitalizacao({
      onSelecionarArquivo: (modo) => acionarInput(innerRef.current, modo),
      onTirarOutra: () => acionarInput(innerRef.current, "camera"),
    });
    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement, []);

    return (
      <div className="relative flex min-w-0 flex-wrap items-center gap-2">
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
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) return onFileChange(null);
            void conferir(f).then((ok) => ok && onFileChange(ok));
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 sm:min-h-10"
          onClick={abrirSeletor}
        >
          <Paperclip className="mr-2 size-4" />
          Selecionar arquivo
        </Button>
        {dialogo}
        <span className="min-w-0 basis-full truncate text-sm text-muted-foreground sm:basis-auto sm:flex-1">
          {file ? file.name : "Nenhum arquivo escolhido"}
        </span>
      </div>
    );
  },
);
DpFilePicker.displayName = "DpFilePicker";
