import { useLandingSection } from "@/hooks/useLandingContent";

export function PersonasStrip() {
  const c = useLandingSection("personas_strip");
  return (
    <section className="border-y border-border/60 bg-muted/30 py-6">
      <div className="container mx-auto px-4">
        <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {c.label}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {c.items.map((i) => (
            <span
              key={i}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 sm:text-sm"
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
