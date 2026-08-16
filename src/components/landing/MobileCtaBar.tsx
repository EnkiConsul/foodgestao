import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

const WHATSAPP_URL =
  "https://wa.me/5562992365959?text=" +
  encodeURIComponent("Olá! Vim pelo site e quero conhecer o 360°FOOD.");

/** Barra fixa de conversão exibida apenas no mobile depois que o usuário passa do hero. */
export function MobileCtaBar({ utm }: { utm: string }) {
  const c = useLandingSection("nav");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-300 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-2">
        <CtaPrimary
          utm={utm}
          source="mobile_bar"
          label={c.cta_primary}
          size="sm"
          className="h-11 flex-1 text-sm"
        />
        <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">
            <MessageCircle className="h-5 w-5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
