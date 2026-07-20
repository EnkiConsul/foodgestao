import { HeartHandshake } from "lucide-react";
import { useLandingSection } from "@/hooks/useLandingContent";
import { CtaPrimary } from "./CtaPrimary";

export function GuaranteeStrip({ utm }: { utm: string }) {
  const c = useLandingSection("guarantee");
  return (
    <section className="border-y border-border/60 bg-primary/5 py-8 sm:py-10">
      <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold sm:text-lg">{c.title}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">{c.subtitle}</p>
          </div>
        </div>
        <CtaPrimary utm={utm} source="guarantee" label={c.cta_label} />
      </div>
    </section>
  );
}
