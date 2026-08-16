import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section, SectionHeading, SiteCard } from "@/components/marketing/primitives";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { useMktPosts } from "@/hooks/useMarketingContent";
import { BLOG_CATEGORIES } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

export default function BlogPage() {
  const { data: posts = [], isLoading } = useMktPosts();
  const [category, setCategory] = useState<string | null>(null);

  const filtered = useMemo(
    () => (category ? posts.filter((post) => post.category === category) : posts),
    [posts, category],
  );

  const availableCategories = BLOG_CATEGORIES.filter((item) => posts.some((post) => post.category === item));

  return (
    <SiteLayout breadcrumbs={[{ name: "Blog", path: "/blog" }]}>
      <SiteSeo
        title="Blog 360°FOOD — Gestão de bares, restaurantes e food service"
        description="Conteúdos sobre gestão financeira, fluxo de caixa, DRE, escalas e gestão de equipes para negócios de alimentação."
        path="/blog"
      />

      <Section labelledBy="blog-title">
        <SectionHeading
          id="blog-title"
          as="h1"
          eyebrow="Blog"
          title="Conteúdo prático para gerir seu negócio de alimentação"
        />

        {availableCategories.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setCategory(null)}
              aria-pressed={category === null}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-bold transition-colors",
                category === null
                  ? "border-site-navy bg-site-navy text-site-navy-foreground"
                  : "border-site-line bg-card text-site-muted hover:text-site-ink",
              )}
            >
              Todos
            </button>
            {availableCategories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-bold transition-colors",
                  category === item
                    ? "border-site-navy bg-site-navy text-site-navy-foreground"
                    : "border-site-line bg-card text-site-muted hover:text-site-ink",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="mt-12 text-center text-sm text-site-muted">Carregando conteúdos...</p>
        ) : filtered.length === 0 ? (
          <p className="mt-12 text-center text-sm text-site-muted">
            Os primeiros conteúdos estão sendo preparados. Volte em breve.
          </p>
        ) : (
          <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => (
              <SiteCard key={post.id} as="li" className="h-full list-none">
                {post.category && (
                  <p className="text-xs font-bold uppercase tracking-wide text-site-orange">{post.category}</p>
                )}
                <h2 className="mt-2 text-base font-extrabold leading-snug text-site-ink">
                  <Link to={`/blog/${post.slug}`} className="hover:text-site-orange">
                    {post.title}
                  </Link>
                </h2>
                {post.excerpt && <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{post.excerpt}</p>}
              </SiteCard>
            ))}
          </ul>
        )}
      </Section>

      <FinalCtaSection />
    </SiteLayout>
  );
}
