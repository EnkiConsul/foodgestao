import { Link } from "react-router-dom";
import { Section, SectionHeading, SiteCard } from "../primitives";
import { Reveal } from "../Reveal";
import { useMktPosts } from "@/hooks/useMarketingContent";

export function BlogTeaserSection() {
  const { data: posts = [] } = useMktPosts(3);
  if (!posts.length) return null;

  return (
    <Section id="conteudo" labelledBy="conteudo-title">
      <SectionHeading
        id="conteudo-title"
        eyebrow="Conteúdo"
        title="Materiais para gerir melhor seu bar ou restaurante"
      />

      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {posts.map((post, index) => (
          <Reveal key={post.id} delay={index * 70} as="li" className="list-none">
            <SiteCard className="h-full">
              {post.category && (
                <p className="text-xs font-bold uppercase tracking-wide text-site-orange">{post.category}</p>
              )}
              <h3 className="mt-2 text-base font-extrabold leading-snug text-site-ink">
                <Link to={`/blog/${post.slug}`} className="hover:text-site-orange">
                  {post.title}
                </Link>
              </h3>
              {post.excerpt && <p className="mt-2.5 text-sm leading-relaxed text-site-muted">{post.excerpt}</p>}
            </SiteCard>
          </Reveal>
        ))}
      </ul>

      <div className="mt-8 text-center">
        <Link to="/blog" className="text-sm font-bold text-site-orange hover:underline">
          Ir para o blog
        </Link>
      </div>
    </Section>
  );
}
