import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
        tone === "dark" ? "bg-white/10 text-white/90" : "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
  id,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  tone?: "light" | "dark";
  id?: string;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        id={id}
        className={cn(
          "mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl",
          tone === "dark" ? "text-white" : "text-site-ink",
        )}
      >
        {title}
      </h2>
      {description && (
        <p className={cn("mt-4 text-base leading-relaxed sm:text-lg", tone === "dark" ? "text-white/75" : "text-site-muted")}>
          {description}
        </p>
      )}
    </div>
  );
}

export function Section({
  children,
  className,
  id,
  variant = "default",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  variant?: "default" | "surface" | "navy";
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "py-16 sm:py-20 lg:py-24",
        variant === "surface" && "bg-site-surface",
        variant === "navy" && "bg-gradient-site-hero text-white",
        className,
      )}
    >
      <div className="site-container">{children}</div>
    </section>
  );
}

export function CheckList({
  items,
  tone = "light",
  className,
}: {
  items: string[];
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              tone === "dark" ? "bg-white/15 text-white" : "bg-site-success/12 text-site-success",
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span className={tone === "dark" ? "text-white/85" : "text-site-ink"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function SiteCard({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "rounded-site-lg border border-site-line bg-card p-6 shadow-site-card transition-shadow duration-200 hover:shadow-site-float",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Moldura para capturas do produto. Mantém proporção fixa para evitar CLS. */
export function MockupFrame({
  src,
  alt,
  caption,
  className,
  priority,
}: {
  src?: string;
  alt: string;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-site-lg border border-site-line bg-card shadow-site-float", className)}>
      <div className="flex items-center gap-1.5 border-b border-site-line bg-site-surface px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-site-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-site-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-site-line" />
        <span className="ml-2 truncate text-[11px] font-semibold text-site-muted">{alt}</span>
      </div>
      {src ? (
        <img
          src={src}
          alt={alt}
          width={1200}
          height={750}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="aspect-[16/10] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[16/10] w-full items-center justify-center bg-site-surface px-6 text-center text-sm font-semibold text-site-muted">
          Espaço reservado para captura real do produto
        </div>
      )}
      {caption && (
        <figcaption className="border-t border-site-line px-4 py-2.5 text-xs text-site-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
