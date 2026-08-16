import { MessageCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useLandingSection } from "@/hooks/useLandingContent";
import { scrollToSection } from "@/lib/landing/scroll";

const WHATSAPP_URL =
  "https://wa.me/5562992365959?text=" +
  encodeURIComponent("Olá! Vim pelo site e tenho uma dúvida sobre o 360°FOOD.");

export function FaqSection() {
  const c = useLandingSection("faq");
  const half = Math.ceil(c.items.length / 2);
  const columns = [c.items.slice(0, half), c.items.slice(half)];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section id="faq" className="border-t border-border/60 bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            As dúvidas mais comuns de quem gerencia bar, restaurante ou uma rede de unidades.
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-5xl gap-x-8 sm:mt-10 md:grid-cols-2">
          {columns.map((group, gi) => (
            <Accordion
              key={`faq-col-${gi}`}
              type="single"
              collapsible
              className="w-full"
            >
              {group.map((f, i) => (
                <AccordionItem
                  key={`${f.q}-${i}`}
                  value={`faq-${gi}-${i}`}
                  className="border-border/60"
                >
                  <AccordionTrigger className="text-left text-sm font-semibold sm:text-base">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ))}
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-border/60 bg-background p-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h3 className="text-base font-semibold">Ficou com outra dúvida?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fale com o nosso time: respondemos por WhatsApp ou pelo formulário.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => scrollToSection("contato")}
            >
              Falar com o time
            </Button>
          </div>
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
