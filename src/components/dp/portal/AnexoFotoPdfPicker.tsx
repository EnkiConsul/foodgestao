import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";

/** Três botões nativos (câmera, galeria e PDF) com prévia e remoção. */
export function AnexoFotoPdfPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const previa = useMemo(
    () => (file && file.type.startsWith("image/") && !/hei[cf]/i.test(file.type) ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  const botoes = [
    { rotulo: "Tirar foto", accept: "image/*", capture: true },
    { rotulo: "Galeria", accept: "image/*", capture: false },
    { rotulo: "PDF", accept: "application/pdf,.pdf", capture: false },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {botoes.map((b) => (
          <label
            key={b.rotulo}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-2 text-center text-sm font-medium hover:bg-accent"
          >
            {b.rotulo}
            <input
              type="file"
              accept={b.accept}
              {...(b.capture ? { capture: "environment" as const } : {})}
              className="sr-only"
              onClick={(e) => { e.currentTarget.value = ""; }}
              onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            />
          </label>
        ))}
      </div>
      {file && (
        <div className="flex min-w-0 items-center gap-2 rounded-md border p-2 text-sm">
          {previa && <img src={previa} alt="Prévia do anexo" className="size-12 shrink-0 rounded object-cover" />}
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remover</Button>
        </div>
      )}
    </div>
  );
}
