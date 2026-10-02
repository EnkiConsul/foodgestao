import { useState } from "react";
import { FolderArchive } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aviso compacto (uma linha) lembrando de guardar a via física original.
 * A digitalização não substitui o papel em perícia grafotécnica.
 */
export function AvisoViaFisica({ className }: { className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <div className="flex items-center gap-1.5">
        <FolderArchive className="size-3.5 shrink-0 text-primary" />
        <span>Guarde a via física original na pasta da empresa.</span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
          aria-expanded={aberto}
        >
          {aberto ? "Ocultar" : "Por quê?"}
        </button>
      </div>
      {aberto && (
        <p className="mt-1 pl-5">
          A digitalização serve para controle e histórico do sistema. Em caso de eventual contestação ou
          perícia na Justiça do Trabalho, a via física original em papel é a prova exigida.
        </p>
      )}
    </div>
  );
}
