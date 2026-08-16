import { ArrowRight, Minus, Plus } from "lucide-react";
import { Section, SectionHeading, SiteCard } from "../primitives";
import { Reveal } from "../Reveal";
import { HOW_IT_WORKS, BEFORE_AFTER, ACCESS_PROFILES } from "@/lib/marketing/content";

export function HowItWorksSection() {
  return (
    <Section id="como-funciona" labelledBy="como-funciona-title">
      <SectionHeading
        id="como-funciona-title"
        eyebrow="Como funciona"
        title="Três passos para sair da planilha"
      />

      <ol className="mt-12 grid gap-5 md:grid-cols-3">
        {HOW_IT_WORKS.map((item, index) => (
          <Reveal key={item.step} delay={index * 80} as="li" className="list-none">
            <SiteCard className="h-full">
              <span className="text-sm font-extrabold tracking-widest text-site-orange">{item.step}</span>
              <p className="mt-3 text-base font-extrabold text-site-ink">{item.title}</p>
              <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{item.text}</p>
            </SiteCard>
          </Reveal>
        ))}
      </ol>

      <div className="mt-16 grid gap-5 lg:grid-cols-2">
        <div className="rounded-site-lg border border-site-line bg-site-surface p-7">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-site-ink">
            <Minus className="h-4 w-4 text-site-danger" /> Antes do 360°FOOD
          </h3>
          <ul className="mt-5 space-y-3">
            {BEFORE_AFTER.before.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-site-muted">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-site-danger" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-site-lg border border-site-success/30 bg-site-success/5 p-7">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-site-ink">
            <Plus className="h-4 w-4 text-site-success" /> Com o 360°FOOD
          </h3>
          <ul className="mt-5 space-y-3">
            {BEFORE_AFTER.after.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-site-ink">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-site-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-16">
        <h3 className="text-center text-xl font-extrabold text-site-ink">Cada pessoa com o acesso certo</h3>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ACCESS_PROFILES.map((profile, index) => (
            <Reveal key={profile.role} delay={index * 60} as="li" className="list-none">
              <SiteCard className="h-full">
                <p className="text-sm font-extrabold text-site-ink">{profile.role}</p>
                <p className="mt-2 text-sm leading-relaxed text-site-muted">{profile.text}</p>
              </SiteCard>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}
