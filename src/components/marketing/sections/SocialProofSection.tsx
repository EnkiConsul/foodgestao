import { Link } from "react-router-dom";
import { Quote } from "lucide-react";
import { Section, SectionHeading, SiteCard } from "../primitives";
import { Reveal } from "../Reveal";
import { useMktCases, useMktLogos, useMktTestimonials } from "@/hooks/useMarketingContent";

export function SocialProofSection({ module }: { module?: "financeiro" | "dp" }) {
  const { data: testimonials = [] } = useMktTestimonials(module);
  const { data: cases = [] } = useMktCases(3);
  const { data: logos = [] } = useMktLogos();

  if (!testimonials.length && !cases.length && !logos.length) return null;

  return (
    <Section id="clientes" variant="surface" labelledBy="clientes-title">
      <SectionHeading
        id="clientes-title"
        eyebrow="Quem usa"
        title="Operações que organizaram a gestão com o 360°FOOD"
      />

      {logos.length > 0 && (
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {logos.map((logo) => (
            <li key={logo.id}>
              <img
                src={logo.logo_url}
                alt={logo.alt_text ?? logo.name}
                loading="lazy"
                className="h-9 w-auto opacity-70 transition-opacity hover:opacity-100"
              />
            </li>
          ))}
        </ul>
      )}

      {testimonials.length > 0 && (
        <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.slice(0, 3).map((item, index) => (
            <Reveal key={item.id} delay={index * 70} as="li" className="list-none">
              <SiteCard className="flex h-full flex-col">
                <Quote className="h-6 w-6 text-site-orange" aria-hidden="true" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-site-ink">“{item.quote}”</blockquote>
                <footer className="mt-5 border-t border-site-line pt-4 text-sm">
                  <p className="font-bold text-site-ink">{item.author_name}</p>
                  <p className="text-site-muted">
                    {[item.author_role, item.company_name].filter(Boolean).join(" · ")}
                  </p>
                </footer>
              </SiteCard>
            </Reveal>
          ))}
        </ul>
      )}

      {cases.length > 0 && (
        <>
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {cases.map((item, index) => (
              <Reveal key={item.id} delay={index * 70} as="li" className="list-none">
                <SiteCard className="h-full">
                  {item.segment && (
                    <p className="text-xs font-bold uppercase tracking-wide text-site-orange">{item.segment}</p>
                  )}
                  <h3 className="mt-2 text-base font-extrabold text-site-ink">
                    <Link to={`/cases/${item.slug}`} className="hover:text-site-orange">
                      {item.title}
                    </Link>
                  </h3>
                  {item.result && <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{item.result}</p>}
                </SiteCard>
              </Reveal>
            ))}
          </ul>
          <div className="mt-8 text-center">
            <Link to="/cases" className="text-sm font-bold text-site-orange hover:underline">
              Ver todos os cases
            </Link>
          </div>
        </>
      )}
    </Section>
  );
}
