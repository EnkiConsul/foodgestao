import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

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
            <div className="mt-6 flex justify-center sm:mt-8">
              <CtaPrimary
                utm={utm}
                source="final_cta"
                label={c.cta_label}
                className="w-full text-base sm:w-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
