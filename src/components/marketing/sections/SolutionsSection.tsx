import { Link } from "react-router-dom";
import { ArrowRight, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading, CheckList } from "../primitives";
import { Reveal } from "../Reveal";
import { SOLUTIONS } from "@/lib/marketing/content";
import { withUtm } from "@/lib/marketing/utm";
import { trackEvent } from "@/lib/analytics";

export function SolutionsSection() {
  return (
    <Section id="solucoes" labelledBy="solucoes-title">
      <SectionHeading
        id="solucoes-title"
        eyebrow="Duas soluções, um ecossistema"
        title="Escolha por onde sua gestão começa"
        description="Comece pelo Financeiro 360°, pelo Pessoas 360° ou pelos dois. Você contrata somente o que sua empresa precisa."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {SOLUTIONS.map((solution, index) => (
          <Reveal key={solution.key} delay={index * 90}>
            <article className="flex h-full flex-col rounded-site-lg border border-site-line bg-card p-7 shadow-site-card transition-shadow hover:shadow-site-float sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-site-md bg-gradient-site-orange text-site-orange-foreground">
                  {solution.key === "financeiro" ? <Wallet className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                </span>
                <h3 className="text-xl font-extrabold text-site-ink">{solution.name}</h3>
              </div>

              <p className="mt-5 text-lg font-bold leading-snug text-site-ink">{solution.headline}</p>
              <p className="mt-3 text-sm leading-relaxed text-site-muted">{solution.description}</p>

              <CheckList items={solution.benefits} className="mt-6" />

              <Button
                asChild
                className="mt-8 h-11 w-full bg-site-navy font-bold text-site-navy-foreground hover:bg-site-navy/90 sm:w-auto sm:self-start sm:px-6"
                onClick={() => trackEvent("cta_click", { cta: "modulo", modulo: solution.key })}
              >
                <Link to={withUtm(solution.route)}>
                  {solution.cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
