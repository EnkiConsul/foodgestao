import { Section, SectionHeading, SiteCard, CheckList } from "../primitives";
import { Reveal } from "../Reveal";

export function PillarsSection({
  eyebrow,
  title,
  description,
  pillars,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  pillars: { title: string; items: string[] }[];
}) {
  return (
    <Section id="recursos" labelledBy="recursos-title">
      <SectionHeading id="recursos-title" eyebrow={eyebrow} title={title} description={description} />
      <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {pillars.map((pillar, index) => (
          <Reveal key={pillar.title} delay={index * 60} as="li" className="list-none">
            <SiteCard className="h-full">
              <h3 className="text-base font-extrabold text-site-ink">{pillar.title}</h3>
              <CheckList items={pillar.items} className="mt-4" />
            </SiteCard>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
