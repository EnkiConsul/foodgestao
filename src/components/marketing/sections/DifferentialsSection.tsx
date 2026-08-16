import { Section, SectionHeading, SiteCard } from "../primitives";
import { Reveal } from "../Reveal";
import { DIFFERENTIALS } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

export function DifferentialsSection() {
  return (
    <Section id="diferenciais" variant="surface" labelledBy="diferenciais-title">
      <SectionHeading
        id="diferenciais-title"
        eyebrow="Por que o 360°FOOD"
        title="Feito para a realidade de quem vende comida e bebida"
        description="Nada de ERP genérico adaptado: a plataforma fala a língua da operação e acompanha o ritmo do salão, da cozinha e do administrativo."
      />

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {DIFFERENTIALS.map((item, index) => (
          <Reveal key={item.title} delay={index * 60} as="li" className="list-none">
            <SiteCard className={cn("h-full", item.highlight && "border-site-orange/40")}>
              <p className="text-base font-extrabold text-site-ink">{item.title}</p>
              <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{item.text}</p>
            </SiteCard>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
