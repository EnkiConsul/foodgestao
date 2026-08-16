import { CloudCog, Landmark, MessageCircle, ShieldCheck } from "lucide-react";
import { useLandingSection } from "@/hooks/useLandingContent";

const ICONS = [ShieldCheck, Landmark, CloudCog, MessageCircle];

export function TrustSection() {
  const c = useLandingSection("trust");
  return (
    <section id="confianca" className="bg-muted/30 py-14 sm:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
            {c.eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{c.title}</h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {c.items.map((t, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div
                key={`${t.title}-${i}`}
                className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{t.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
