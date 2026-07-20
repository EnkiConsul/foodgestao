import { Card, CardContent } from "@/components/ui/card";
import { useLandingSection } from "@/hooks/useLandingContent";

export function FaqSection() {
  const c = useLandingSection("faq");
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
        </div>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:mt-10 md:grid-cols-2">
          {c.items.map((f, i) => (
            <Card key={`${f.q}-${i}`} className="border-border/60">
              <CardContent className="p-5">
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
