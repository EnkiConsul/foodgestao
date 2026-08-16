import { useLandingSection } from "@/hooks/useLandingContent";

export function HowItWorksSection() {
  const c = useLandingSection("how_it_works");
  return (
    <section id="como-funciona" className="bg-muted/30 py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{c.subtitle}</p>
        </div>

        <ol className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-12 sm:gap-5 lg:grid-cols-4">
          {c.steps.map((s, i) => (
            <li
              key={`${s.title}-${i}`}
              className="relative rounded-2xl border border-border/60 bg-card p-5 sm:p-6"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {i + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold sm:text-lg">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-center text-xs text-muted-foreground sm:text-sm">{c.note}</p>
      </div>
    </section>
  );
}
