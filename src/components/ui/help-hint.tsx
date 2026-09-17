import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";
import { HELP_CONTENT, type HelpKey } from "@/content/help/helpContent";

export interface HelpHintProps {
  /** Chave do texto centralizado em `helpContent.ts`. */
  helpKey?: HelpKey;
  /** Nome da funcionalidade — usado no nome acessível ("Ajuda sobre ..."). */
  label?: string;
  /** Texto avulso (usar somente quando não houver chave adequada). */
  text?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  /** Tamanho do ícone: 14px (sm) ou 16px (md). */
  size?: "sm" | "md";
}

const FECHAR_APOS_MS = 120;

/**
 * Ajuda contextual: ícone "?" discreto ao lado do nome da funcionalidade.
 *
 * - abre no hover, no foco pelo teclado e no toque/clique;
 * - fecha no Escape, no clique fora, ao sair o ponteiro ou perder o foco;
 * - permanece aberto enquanto o ponteiro estiver sobre o conteúdo;
 * - não reabre logo após o Escape enquanto o foco/hover continuar no ícone;
 * - conteúdo apenas textual (nunca interativo) e renderizado em portal.
 */
export function HelpHint({ helpKey, label, text, side = "top", align = "center", className, size = "sm" }: HelpHintProps) {
  const entrada = helpKey ? HELP_CONTENT[helpKey] : undefined;
  const titulo = label ?? entrada?.titulo;
  const texto = text ?? entrada?.texto;

  const [aberto, setAberto] = React.useState(false);
  const suprimidoRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const descricaoId = React.useId();

  const cancelarFechamento = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => cancelarFechamento, [cancelarFechamento]);

  const abrir = React.useCallback(() => {
    cancelarFechamento();
    if (suprimidoRef.current) return;
    setAberto(true);
  }, [cancelarFechamento]);

  const agendarFechamento = React.useCallback(() => {
    cancelarFechamento();
    timerRef.current = setTimeout(() => setAberto(false), FECHAR_APOS_MS);
  }, [cancelarFechamento]);

  const fecharComSupressao = React.useCallback(() => {
    cancelarFechamento();
    suprimidoRef.current = true;
    setAberto(false);
  }, [cancelarFechamento]);

  if (!texto) return null;

  const nomeAcessivel = titulo ? `Ajuda sobre ${titulo}` : "Ajuda";
  const iconeClasse = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <PopoverPrimitive.Root
      open={aberto}
      onOpenChange={(proximo) => {
        if (!proximo) cancelarFechamento();
        setAberto(proximo);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          data-help-hint=""
          aria-label={nomeAcessivel}
          aria-describedby={aberto ? descricaoId : undefined}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/80",
            "transition-colors hover:text-foreground hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            "sm:h-6 sm:w-6 [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8",
            "align-middle",
            className,
          )}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") abrir();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            suprimidoRef.current = false;
            agendarFechamento();
          }}
          onFocus={() => abrir()}
          onBlur={() => {
            suprimidoRef.current = false;
            cancelarFechamento();
            setAberto(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && aberto) {
              event.stopPropagation();
              fecharComSupressao();
            }
          }}
          onClick={(event) => {
            // Nunca navega, submete formulário nem dispara ação do elemento pai.
            event.preventDefault();
            event.stopPropagation();
            cancelarFechamento();
            if (aberto) {
              fecharComSupressao();
            } else {
              suprimidoRef.current = false;
              setAberto(true);
            }
          }}
        >
          <CircleHelp className={iconeClasse} aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={descricaoId}
          role="tooltip"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={() => {
            suprimidoRef.current = true;
          }}
          onPointerEnter={cancelarFechamento}
          onPointerLeave={agendarFechamento}
          className={cn(
            "z-[70] w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-3 py-2",
            "text-xs leading-relaxed text-popover-foreground shadow-md",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        >
          {titulo && <p className="mb-0.5 font-semibold">{titulo}</p>}
          <p className="whitespace-pre-line break-words">{texto}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export default HelpHint;
