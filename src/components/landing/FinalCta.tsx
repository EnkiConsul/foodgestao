import { Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

const WHATSAPP_URL =
  "https://wa.me/5562992365959?text=" +
  encodeURIComponent("Olá! Vim pelo site e quero conhecer o 360°FOOD.");

const BULLETS = [
  "Sem instalação: usa no computador e no celular",
  "Conexão bancária somente leitura",
  "Suporte humano por WhatsApp",
];

export function FinalCta({ utm }: { utm: string }) {
  const c = useLandingSection("final_cta");
  return (
    <section className="py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl bg-sidebar p-6 text-center text-sidebar-foreground sm:p-10 lg:p-14">
          <div
            className="absolute inset-0 -z-0 opacity-50"
            style={{
              background:
                "radial-gradient(40% 60% at 50% 0%, hsl(var(--sidebar-primary) / 0.3), transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              {c.title}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-sidebar-foreground/80 sm:mt-4 sm:text-base">
              {c.subtitle}
            </p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
              <CtaPrimary
                utm={utm}
                source="final_cta"
                label={c.cta_label}
                className="w-full text-base sm:w-auto"
              />
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:w-auto"
              >
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  Falar no WhatsApp
                </a>
              </Button>
            </div>
            <ul className="mx-auto mt-6 flex max-w-3xl flex-col items-center justify-center gap-2 text-xs text-sidebar-foreground/75 sm:flex-row sm:gap-6 sm:text-sm">
              {BULLETS.map((b) => (
                <li key={b} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 shrink-0 text-sidebar-primary" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
