import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Props {
  /** Ficha aberta; `null` fecha a gaveta. Trocar o id volta a rolagem ao topo. */
  fichaId: string | null;
  nome: string;
  posicao: number;
  total: number;
  onFechar: () => void;
  /** Recebe a base fixa onde a ficha desenha as ações (Ignorar, Salvar e próxima, Criar cadastro). */
  children: (rodape: HTMLElement | null) => ReactNode;
}

/**
 * Gaveta da conferência individual do lote: nome da pessoa fixo no topo, só o
 * meio rola e as ações ficam numa base fixa (respeitando a área segura do
 * celular), sem dois elementos "grudados" disputando a mesma rolagem.
 */
export function ConferenciaFichaGaveta({ fichaId, nome, posicao, total, onFechar, children }: Props) {
  const isMobile = useIsMobile();
  const rolagemRef = useRef<HTMLDivElement | null>(null);
  const [rodape, setRodape] = useState<HTMLDivElement | null>(null);

  // "Salvar e próxima" troca a ficha sem fechar a gaveta: começa pelo topo (nome).
  useEffect(() => {
    if (fichaId) rolagemRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [fichaId]);

  return (
    <Sheet open={!!fichaId} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        aria-describedby={undefined}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 [padding-bottom:0] [padding-top:0]",
          isMobile ? "h-[92dvh] max-h-[92dvh] rounded-t-2xl" : "w-full sm:max-w-2xl",
        )}
      >
        <SheetHeader className="shrink-0 space-y-0.5 border-b bg-background px-4 py-3 pr-12 text-left">
          <SheetTitle className="truncate text-base leading-tight">{nome}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Ficha {posicao} de {total}
          </p>
        </SheetHeader>
        <div ref={rolagemRef} data-rolagem-ficha className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
          {fichaId && children(rodape)}
        </div>
        <div
          ref={setRodape}
          className="shrink-0 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] empty:hidden"
        />
      </SheetContent>
    </Sheet>
  );
}
