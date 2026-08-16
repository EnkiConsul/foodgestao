import { Link, useParams } from "react-router-dom";
import { SiteLayout } from "@/components/marketing/SiteLayout";
import { SiteSeo } from "@/components/marketing/SiteSeo";
import { Section } from "@/components/marketing/primitives";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { useMktPost } from "@/hooks/useMarketingContent";
import { SITE_ORIGIN } from "@/lib/marketing/content";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading } = useMktPost(slug);

  if (isLoading) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-center text-sm text-site-muted">Carregando conteúdo...</p>
        </Section>
      </SiteLayout>
    );
  }

  if (!post) {
    return (
      <SiteLayout breadcrumbs={[{ name: "Blog", path: "/blog" }]}>
        <SiteSeo title="Conteúdo não encontrado — 360°FOOD" description="Este conteúdo não está disponível." path="/blog" noindex />
        <Section>
          <p className="text-center text-sm text-site-muted">
            Este conteúdo não está disponível.{" "}
            <Link to="/blog" className="font-bold text-site-orange hover:underline">
              Ver o blog
            </Link>
          </p>
        </Section>
      </SiteLayout>
    );
  }

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_content_at ?? post.published_at ?? undefined,
    author: post.author_name ? { "@type": "Person", name: post.author_name } : undefined,
    publisher: { "@type": "Organization", name: "360°FOOD", url: SITE_ORIGIN },
    mainEntityOfPage: `${SITE_ORIGIN}/blog/${post.slug}`,
  } as Record<string, unknown>;

  return (
    <SiteLayout
      breadcrumbs={[
        { name: "Blog", path: "/blog" },
        { name: post.title, path: `/blog/${post.slug}` },
      ]}
    >
      <SiteSeo
        title={post.seo_title ?? `${post.title} — Blog 360°FOOD`}
        description={post.seo_description ?? post.excerpt ?? "Conteúdo sobre gestão para bares e restaurantes."}
        path={`/blog/${post.slug}`}
        type="article"
        jsonLd={[articleLd]}
      />

      <Section labelledBy="post-title">
        <article className="mx-auto max-w-3xl">
          {post.category && <p className="text-xs font-bold uppercase tracking-wide text-site-orange">{post.category}</p>}
          <h1 id="post-title" className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-sm text-site-muted">
            {[
              post.author_name && `Por ${post.author_name}`,
              post.reviewer_name && `Revisão técnica: ${post.reviewer_name}`,
              post.published_at && new Date(post.published_at).toLocaleDateString("pt-BR"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {post.cover_url && (
            <img
              src={post.cover_url}
              alt={post.cover_alt ?? post.title}
              loading="lazy"
              className="mt-8 w-full rounded-site-lg border border-site-line object-cover"
            />
          )}

          {post.excerpt && <p className="mt-8 text-lg font-semibold leading-relaxed text-site-ink">{post.excerpt}</p>}
          {post.body && (
            <div className="mt-6 whitespace-pre-line text-base leading-relaxed text-site-ink">{post.body}</div>
          )}
        </article>
      </Section>

      <FinalCtaSection />
    </SiteLayout>
  );
}
